import os
import io
import base64
import warnings
from concurrent.futures import ThreadPoolExecutor

# --- FastAPI ---
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# --- Procesamiento / modelos ---
import numpy as np
from PIL import Image
import cv2
import torch
from ultralytics import YOLO

warnings.filterwarnings("ignore", category=FutureWarning)

# ==========================================================
# 🚀 OPTIMIZACIÓN GLOBAL
# ==========================================================
torch.backends.cudnn.benchmark = True
cv2.setUseOptimized(True)
try:
    cv2.setNumThreads(1)
except Exception:
    pass

# ==========================================================
# ⚙️ Configuración FastAPI
# ==========================================================
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=2)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"🧠 Usando dispositivo: {device}")
if device.type == "cuda":
    print(f"🔥 GPU detectada: {torch.cuda.get_device_name(0)}")

# ==========================================================
# 📦 Modelos y parámetros
# ==========================================================
TARGET_SIZE = (224, 224)  # menor resolución → más rápido
YOLO_CONF_THR = 0.4       # confianza mínima
ALERTA_DISTANCIA = 1.5    # metros
K_CONSTANTE = 5000         # constante para estimar distancia (ajustable)

class FrameInput(BaseModel):
    frame_b64: str

# ==========================================================
# 📥 Cargar modelo YOLO (optimizado GPU)
# ==========================================================
print("Cargando modelo YOLOv8 nano optimizado para GPU...")

try:
    yolo_model = YOLO("yolov8n.pt")
    yolo_model.to(device)
    if device.type == "cuda":
        yolo_model.model.half()
    print("✅ YOLOv8 Nano cargado correctamente.")
except Exception as e:
    print(f"⚠️ Error al cargar YOLO: {e}")
    yolo_model = None

# ==========================================================
# 🧩 Utilidades
# ==========================================================
def pil_to_cv2_bgr(pil_img: Image.Image):
    arr = np.asarray(pil_img.convert("RGB"))
    return arr[:, :, ::-1].copy()

def encode_jpg_b64(cv2_img, quality=40):
    _, buf = cv2.imencode(".jpg", cv2_img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return base64.b64encode(buf).decode("utf-8")

# ==========================================================
# 🧠 Inferencia con estimación de distancia
# ==========================================================
def run_yolo_fast(pil_image: Image.Image):
    if yolo_model is None:
        return None, []
    
    resized = pil_image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    results = yolo_model(resized, verbose=False, conf=YOLO_CONF_THR)
    detections = []

    if results and len(results) > 0:
        boxes = results[0].boxes
        for i in range(len(boxes)):
            conf = float(boxes.conf[i].item())
            if conf < YOLO_CONF_THR:
                continue
            cls = int(boxes.cls[i].item())
            if cls != 0:
                continue  # solo personas
            xyxy = boxes.xyxy[i].cpu().numpy().tolist()
            x1, y1, x2, y2 = map(int, xyxy)
            h = y2 - y1
            # 🔹 Estimar distancia en metros
            distancia_m = round(K_CONSTANTE / h, 2)
            detections.append({
                "x": x1, "y": y1, "w": x2 - x1, "h": h,
                "confidence": conf,
                "distance_m": distancia_m
            })
    return results, detections

def draw_boxes(img_bgr, detections):
    frame_h, frame_w = img_bgr.shape[:2]
    alerta_activa = False

    for det in detections:
        x, y, w, h = det["x"], det["y"], det["w"], det["h"]
        distancia_m = det["distance_m"]

        # 🔹 Cambiar color según distancia
        color = (0, 255, 0)  # verde
        if distancia_m < ALERTA_DISTANCIA:
            color = (0, 0, 255)  # rojo
            alerta_activa = True

        # 🔹 Dibujar el rectángulo y etiqueta
        cv2.rectangle(img_bgr, (x, y), (x + w, y + h), color, 2)
        label = f"{distancia_m} m"
        cv2.putText(img_bgr, label, (x, max(15, y - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # 🔹 Mostrar mensaje global si hay alerta
    if alerta_activa:
        cv2.putText(img_bgr, "⚠ ALERTA: Persona muy cerca!",
                    (30, frame_h - 30), cv2.FONT_HERSHEY_DUPLEX,
                    0.9, (0, 0, 255), 3)

    return img_bgr

# ==========================================================
# 🌐 Endpoints
# ==========================================================
@app.post("/stream_infer")
async def stream_infer(data: FrameInput):
    if yolo_model is None:
        return JSONResponse({"ok": False, "error": "Modelo no cargado."}, status_code=503)

    try:
        img_bytes = base64.b64decode(data.frame_b64)
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        _, dets = run_yolo_fast(pil_image)
        img_bgr = pil_to_cv2_bgr(pil_image)
        img_out = draw_boxes(img_bgr, dets)
        b64_overlay = encode_jpg_b64(img_out, quality=40)

        alerta = any(d["distance_m"] < ALERTA_DISTANCIA for d in dets)

        return JSONResponse({
            "ok": True,
            "overlay_jpg_b64": b64_overlay,
            "boxes": dets,
            "alerta": alerta
        })

    except Exception as e:
        print("Error en stream_infer:", e)
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

# ==========================================================
# 🚀 Ejecución
# ==========================================================
if __name__ == "__main__":
    print("🚀 Servidor GPU activo en http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
