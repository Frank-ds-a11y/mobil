from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import io, base64
from PIL import Image
import numpy as np
import cv2
import torch
import warnings
# Importar YOLOv5
from ultralytics import YOLO 

# Suprimir advertencias de PyTorch/MiDaS para una consola más limpia
warnings.filterwarnings("ignore", category=FutureWarning)

# ==========================================================
# 1. INICIALIZACIÓN GLOBAL
# ==========================================================

app = FastAPI() # 1. Definir 'app' primero.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Definir 'device' para que sea visible globalmente.
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Usando dispositivo: {device}")

midas = None
yolo_model = None
TARGET_SIZE = (384, 384) # Tamaño fijo para DPT_Hybrid

# ==========================================================
# 2. CARGA DE MODELOS
# ==========================================================

# ---- Carga de MiDaS (Profundidad) ----
print("Cargando MiDaS (DPT_Hybrid)...")
try:
    model_type = "DPT_Hybrid"
    midas = torch.hub.load("intel-isl/MiDaS", model_type, trust_repo=True)
    midas.eval()
    midas.to(device)
    print("✅ MiDaS cargado con éxito.")

except Exception as e:
    print(f"❌ Error al cargar MiDaS: {e}")
    raise SystemExit(f"Fallo crítico: No se pudo cargar el modelo MiDaS. {e}")

# ---- Carga de YOLO (Personas) ----
print("Cargando YOLOv5s (detección de personas)...")
try:
    # Usamos el modelo más ligero y rápido 'yolov5nu.pt'
    yolo_model = YOLO('yolov5nu.pt') 
    yolo_model.to(device) 
    print("✅ YOLOv5 cargado con éxito.")

except Exception as e:
    # Si YOLO falla, el script NO debe detenerse, pero la detección de personas se deshabilita.
    print(f"⚠️ Error al cargar YOLO: {e}. La detección de personas estará deshabilitada.")
    yolo_model = None

# ==========================================================
# 3. UTILIDADES
# ==========================================================

def pil_to_cv2(img_pil: Image.Image):
    """Convierte una imagen PIL a un array de numpy BGR (formato OpenCV)."""
    img = np.array(img_pil.convert("RGB"))[:, :, ::-1].copy()
    return img

def depth_to_mask(depth_map: np.ndarray, normal_threshold=0.45, planar_threshold=0.03, min_region_area=1500):
    """Genera la máscara de muros basada en profundidad y heurística de normales."""
    h, w = depth_map.shape
    d = depth_map.astype(np.float32)
    d = (d - d.min()) / (d.max() - d.min() + 1e-8)

    # Cálculo de gradientes para normales (usando Sobel)
    dzdx = cv2.Sobel(d, cv2.CV_32F, 1, 0, ksize=3)
    dzdy = cv2.Sobel(d, cv2.CV_32F, 0, 1, ksize=3)
    nx = -dzdx; ny = -dzdy; nz = np.ones_like(d) 
    norm = np.sqrt(nx*nx + ny*ny + nz*nz) + 1e-8
    nx /= norm; ny /= norm; nz /= norm

    # Criterio 1: Componente horizontal grande (|nx| grande)
    hor_mask = (np.abs(nx) > normal_threshold).astype(np.uint8)

    # Criterio 2: Planaridad (baja varianza local)
    k = 11
    mean_nx = cv2.blur(nx, (k,k)); mean_ny = cv2.blur(ny, (k,k)); mean_nz = cv2.blur(nz, (k,k))
    var = cv2.blur((nx-mean_nx)**2 + (ny-mean_ny)**2 + (nz-mean_nz)**2, (k,k))
    planar_mask = (var < planar_threshold).astype(np.uint8)

    mask = ((hor_mask & planar_mask) * 255).astype(np.uint8)
    
    # Limpieza morfológica y eliminación de regiones pequeñas
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5,5)) 
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    final = np.zeros_like(mask)
    for c in contours:
        if cv2.contourArea(c) >= min_region_area:
            cv2.drawContours(final, [c], -1, 255, thickness=cv2.FILLED)
            
    return final

def overlay_mask_on_image(orig_bgr: np.ndarray, mask: np.ndarray, alpha=0.4):
    """Superpone la máscara de pared (roja) sobre la imagen original."""
    mask_f = mask / 255.0
    red_layer = np.zeros_like(orig_bgr, dtype=np.uint8)
    red_layer[:, :, 2] = 255 
    red_overlay = (red_layer * mask_f[:, :, np.newaxis]).astype(np.uint8)
    overlay = cv2.addWeighted(orig_bgr, 1 - alpha, red_overlay, alpha, 0)
    return overlay

def overlay_person_boxes(orig_bgr: np.ndarray, detections, color=(0, 255, 0), thickness=3):
    """Dibuja los bounding boxes de las personas (verde) sobre la imagen."""
    overlay_img = orig_bgr.copy()
    
    for det in detections:
        # Extraer coordenadas [x1, y1, x2, y2]
        x1, y1, x2, y2 = map(int, det.xyxy[0].tolist())
        # Extraer confianza
        conf = det.conf[0].item()

        # Dibujar el rectángulo
        cv2.rectangle(overlay_img, (x1, y1), (x2, y2), color, thickness)
        # Dibujar etiqueta y confianza
        label = f'Persona {conf:.2f}'
        cv2.putText(overlay_img, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, thickness)
            
    return overlay_img

# ==========================================================
# 4. ENDPOINT PRINCIPAL
# ==========================================================

@app.post("/infer")
async def infer_image(file: UploadFile = File(...)):
    """Recibe una imagen, calcula profundidad, detecta muros y personas, y devuelve resultados Base64."""
    try:
        contents = await file.read()
        pil_image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        cv2_img = pil_to_cv2(pil_image)
        input_image_rgb = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
        
        # --- 1. Detección de Muros (MiDaS) ---
        # (Lógica de preprocesamiento de MiDaS)
        resized_image = pil_image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        img_np = np.asarray(resized_image, dtype=np.float32) / 255.0
        img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).float()
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
        img_input = ((img_tensor - mean) / std).to(device).unsqueeze(0)
        
        with torch.no_grad():
            prediction = midas(img_input)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=input_image_rgb.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze().cpu().numpy()

        mask = depth_to_mask(prediction)
        overlay_muros = overlay_mask_on_image(cv2_img, mask)
        
        # --- 2. Detección de Personas (YOLO) ---
        person_boxes_data = []
        person_detections = []
        final_overlay = overlay_muros # Inicialmente, el overlay solo tiene muros

        if yolo_model is not None:
            # Ejecutar YOLOv5
            yolo_results = yolo_model(pil_image, verbose=False) 
            
            if yolo_results and len(yolo_results) > 0:
                results = yolo_results[0].boxes
                # Filtrar solo resultados con clase 0 (person)
                person_results = results[results.cls == 0] 
                
                for det in person_results:
                    x1, y1, x2, y2 = map(int, det.xyxy[0].tolist())
                    conf = det.conf[0].item()
                    
                    person_boxes_data.append({
                        "x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1,
                        "confidence": float(conf), "label": "person"
                    })
                    person_detections.append(det)

            # Superponer los bounding boxes de personas (verde) sobre el overlay de muros
            final_overlay = overlay_person_boxes(overlay_muros, person_detections)
        else:
            print("Saltando detección de personas. Modelo YOLO no cargado.")

        # --- 3. Consolidación de Resultados ---
        
        # Bounding boxes de Muros
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        wall_boxes = []
        for c in contours:
            x,y,w,h = cv2.boundingRect(c)
            wall_boxes.append({
                "x": int(x), "y": int(y), "w": int(w), "h": int(h), 
                "area": int(cv2.contourArea(c)), "label": "wall" 
            })
        
        all_boxes = wall_boxes + person_boxes_data

        # Codificación a Base64
        _, buf_overlay = cv2.imencode('.jpg', final_overlay)
        _, buf_mask = cv2.imencode('.png', mask)

        b64_overlay = base64.b64encode(buf_overlay).decode('utf-8')
        b64_mask = base64.b64encode(buf_mask).decode('utf-8')

        print(f"Detección exitosa. Muros: {len(wall_boxes)}, Personas: {len(person_boxes_data)}")

        return JSONResponse({
            "ok": True,
            "overlay_jpg_b64": b64_overlay,
            "mask_png_b64": b64_mask,
            "boxes": all_boxes 
        })

    except Exception as e:
        print(f"Error en el procesamiento de imagen: {e}")
        return JSONResponse({"ok": False, "error": f"Error en el procesamiento: {str(e)}"}, status_code=500)


if __name__ == "__main__":
    print("Iniciando servidor FastAPI en http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)