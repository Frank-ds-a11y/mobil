# server.py
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

# AJUSTA ESTA RUTA si tu modelo está en otro lugar
MODEL_PATH = r"C:\Users\aruel\Documents\Proyectos\React\best.pt"

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
# COLORES SÓLIDOS POR CLASE (para overlay)
# -----------------------------
CLASS_COLORS = {}
def get_class_color(cls_id):
    if cls_id not in CLASS_COLORS:
        np.random.seed(int(cls_id) if isinstance(cls_id, (int, np.integer)) else hash(str(cls_id)) & 0xFFFFFFFF)
        CLASS_COLORS[cls_id] = tuple(int(v) for v in np.random.randint(50, 255, size=3))
    return CLASS_COLORS[cls_id]


# -----------------------------
# MODELO DE ENTRADA
# -----------------------------
class FrameInput(BaseModel):
    frame_b64: str


# -----------------------------
# AUX: convertir PIL -> cv2 BGR
# -----------------------------
def pil_to_cv2_bgr(img):
    arr = np.asarray(img.convert("RGB"))
    return arr[:, :, ::-1].copy()


def encode_jpg_b64(cv2_img, quality=60):
    _, buf = cv2.imencode(".jpg", cv2_img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return base64.b64encode(buf).decode()


# -----------------------------
# MAPA DE ALTURAS REALES (m) POR CLASE
# (Al ser modelo personalizado, ajusta si conoces otras clases)
# -----------------------------
CLASS_HEIGHTS_M = {
    # nombres de clase -> altura aproximada en metros (usados para cálculo de distancia)
    "persona": 1.60,
    "person": 1.60,
    "auto": 1.40,
    "car": 1.40,
    "silla": 0.9,
    "chair": 0.9,
    "mesa": 0.75,
    "table": 0.75,
    "bache": 1.60,
    "pothole": 1.60,
    "bench": 1.60,
    "banqueta": 1.60,
    "car mirror": 0.9,
    "retrovisor": 0.9,
    "puerta auto":0.75,
    "car door": 0.75,
    # si tu modelo tiene otras clases, agrégalas aquí
}

DEFAULT_OBJECT_HEIGHT_M = 1.0  # fallback


# -----------------------------
# ENDPOINT PRINCIPAL
# -----------------------------
@app.post("/stream_infer")
async def stream_infer(data: FrameInput):
    try:
        if yolo_model is None:
            return JSONResponse({"ok": False, "error": "Modelo no cargado"}, status_code=500)

        # decodificar imagen enviada desde la app
        img_bytes = base64.b64decode(data.frame_b64)
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        # INFERENCIA
        results = yolo_model(pil_image, verbose=False)[0]

        img_bgr = pil_to_cv2_bgr(pil_image)
        img_h, img_w = img_bgr.shape[:2]

        info_objects = []

        # Parámetros para estimación de distancia
        # focal_pixels: valor heurístico (ajusta si tienes calibración)
        focal_pixels = 700.0

        # RECORRER DETECCIONES
        if hasattr(results, "boxes") and results.boxes is not None:
            for box in results.boxes:
                try:
                    cls_idx = int(box.cls.item())
                    conf = float(box.conf.item())
                    xyxy = box.xyxy.cpu().numpy()[0]
                    x1, y1, x2, y2 = map(int, xyxy)
                    w = x2 - x1
                    h = y2 - y1

                    # Nombre de la clase (si model.names existe)
                    label = yolo_model.names.get(cls_idx, str(cls_idx)) if hasattr(yolo_model, "names") else str(cls_idx)

                    # Dirección horizontal (izquierda/centro/derecha)
                    center_x = (x1 + x2) / 2.0
                    if center_x < img_w * 0.33:
                        direction = "izquierda"
                    elif center_x > img_w * 0.66:
                        direction = "derecha"
                    else:
                        direction = "frente"

                    # Altura real estimada (por clase)
                    real_h_m = CLASS_HEIGHTS_M.get(label.lower(), DEFAULT_OBJECT_HEIGHT_M)

                    # Estimación de distancia (modelo pinhole: distance = real_height * focal / pixel_height)
                    # Evitar división por cero
                    pixel_h = max(h, 1)
                    distance_m = (real_h_m * focal_pixels) / pixel_h
                    distance_m = round(float(distance_m), 2)

                    info = {
                        "cls": cls_idx,
                        "label": label,
                        "conf": round(conf, 3),
                        "x1": int(x1),
                        "y1": int(y1),
                        "x2": int(x2),
                        "y2": int(y2),
                        "w": int(w),
                        "h": int(h),
                        "direction": direction,
                        "distance_m": distance_m
                    }

                    info_objects.append(info)

                    # Dibujar caja y texto en overlay
                    color = get_class_color(cls_idx)
                    cv2.rectangle(img_bgr, (x1, y1), (x2, y2), color, 2)
                    text = f"{label} {direction} {distance_m}m"
                    cv2.putText(img_bgr, text, (x1, max(y1 - 8, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                except Exception as e:
                    # si una detección falla, la saltamos pero no paramos el servidor
                    print("Error en procesar detección:", e)
                    continue

        # SEGMENTACIÓN (si aplica)
        if hasattr(results, "masks") and results.masks is not None:
            try:
                masks = results.masks.data.cpu().numpy()
                for m in masks:
                    mask = (m * 255).astype(np.uint8)
                    mask = cv2.resize(mask, (img_bgr.shape[1], img_bgr.shape[0]))
                    colored = np.zeros_like(img_bgr)
                    colored[:, :, 1] = mask
                    img_bgr = cv2.addWeighted(img_bgr, 1, colored, 0.4, 0)
            except Exception as e:
                print("Warning - máscara:", e)

        # Ordenar objetos por distancia (más cercano primero)
        info_objects = sorted(info_objects, key=lambda o: o["distance_m"])

        # Codificar overlay a base64
        b64_overlay = encode_jpg_b64(img_bgr, quality=60)

        return JSONResponse({
            "ok": True,
            "objects": info_objects,   # lista de objetos con direction y distance_m
            "overlay_jpg_b64": b64_overlay
        })

    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# -----------------------------
# SERVIDOR (solo si ejecutas python server.py)
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    print("🚀 Servidor en http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
