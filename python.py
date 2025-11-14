import os
import io
import base64
import warnings
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import numpy as np
from PIL import Image
import cv2
import torch
from ultralytics import YOLO

warnings.filterwarnings("ignore", category=FutureWarning)

torch.backends.cudnn.benchmark = True
cv2.setUseOptimized(True)

try:
    cv2.setNumThreads(1)
except:
    pass

# -----------------------------
# CONFIG FASTAPI
# -----------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=2)

# -----------------------------
# CARGAR MODELO YOLO11X-SEG
# -----------------------------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("🧠 Usando:", device)

MODEL_PATH = r"C:\Users\aruel\Documents\Proyectos\React\yolo11x-seg.pt"

if not os.path.exists(MODEL_PATH):
    print("❌ ERROR: No existe el modelo:", MODEL_PATH)
    yolo_model = None
else:
    print("Cargando modelo", MODEL_PATH)
    yolo_model = YOLO(MODEL_PATH)

    if device.type == "cuda":
        yolo_model.to("cuda")
        print("⚡ Modelo enviado a CUDA")
    else:
        print("📌 Usando modelo en CPU")

    print("✅ Modelo cargado correctamente")

# -----------------------------
# COLORES SÓLIDOS POR CLASE
# -----------------------------
CLASS_COLORS = {
    0: (255, 0, 0),       # rojo
    1: (0, 255, 0),       # verde
    2: (0, 0, 255),       # azul
    3: (255, 255, 0),     # cyan
    4: (255, 0, 255),     # magenta
    5: (0, 255, 255),     # amarillo
}

def get_class_color(cls_id):
    if cls_id not in CLASS_COLORS:
        np.random.seed(cls_id)
        CLASS_COLORS[cls_id] = tuple(int(v) for v in np.random.randint(50, 255, size=3))
    return CLASS_COLORS[cls_id]

# -----------------------------
# MODELO DE ENTRADA
# -----------------------------
class FrameInput(BaseModel):
    frame_b64: str

# -----------------------------
# FUNCIONES AUXILIARES
# -----------------------------
def pil_to_cv2_bgr(img):
    arr = np.asarray(img.convert("RGB"))
    return arr[:, :, ::-1].copy()

def encode_jpg_b64(cv2_img, quality=40):
    _, buf = cv2.imencode(".jpg", cv2_img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return base64.b64encode(buf).decode()

# -----------------------------
# ENDPOINT PRINCIPAL
# -----------------------------
@app.post("/stream_infer")
async def stream_infer(data: FrameInput):
    try:
        if yolo_model is None:
            return JSONResponse({"ok": False, "error": "Modelo no cargado"}, status_code=500)

        img_bytes = base64.b64decode(data.frame_b64)
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        # 🔥 INFERENCIA
        results = yolo_model(pil_image, verbose=False)[0]

        dets = []
        img_bgr = pil_to_cv2_bgr(pil_image)

        # -----------------------------
        # PROCESAR DETECCIONES
        # -----------------------------
        for box in results.boxes:
            cls = int(box.cls.item())
            conf = float(box.conf.item())
            x1, y1, x2, y2 = map(int, box.xyxy.cpu().numpy()[0])

            label = yolo_model.names[cls]
            dets.append({
                "cls": cls,
                "label": label,
                "conf": conf,
                "x": x1,
                "y": y1,
                "w": x2 - x1,
                "h": y2 - y1
            })

            # ⭐ Color sólido por clase
            color = get_class_color(cls)

            # BOX
            cv2.rectangle(img_bgr, (x1, y1), (x2, y2), color, 2)

            # TEXTO
            cv2.putText(
                img_bgr,
                f"{label} {conf:.2f}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2
            )

        # -----------------------------
        # SEGMENTACIÓN (si existe)
        # -----------------------------
        if hasattr(results, "masks") and results.masks is not None:
            masks = results.masks.data.cpu().numpy()
            for m in masks:
                mask = (m * 255).astype(np.uint8)
                mask = cv2.resize(mask, (img_bgr.shape[1], img_bgr.shape[0]))
                colored = np.zeros_like(img_bgr)
                colored[:, :, 1] = mask  # verde sólido
                img_bgr = cv2.addWeighted(img_bgr, 1, colored, 0.4, 0)

        # -----------------------------
        # CODIFICAR IMAGEN SALIDA
        # -----------------------------
        b64_overlay = encode_jpg_b64(img_bgr)

        return JSONResponse({
            "ok": True,
            "boxes": dets,
            "overlay_jpg_b64": b64_overlay
        })

    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

# -----------------------------
# SERVIDOR
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    print("🚀 Servidor en http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
