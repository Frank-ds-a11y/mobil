import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  StyleSheet,
  Button,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState("back");
  const [isStreaming, setIsStreaming] = useState(false);
  const [processedFrame, setProcessedFrame] = useState(null);
  const [detecciones, setDetecciones] = useState([]);

  const cameraRef = useRef(null);

  // ⚙️ Tu IP local (ajústala)
  const SERVER_URL = "http://192.168.1.196:8000/stream_infer";

  // 🔸 Solicitar permisos
  useEffect(() => {
    if (!permission) requestPermission();
  }, []);

  const toggleFacing = () =>
    setFacing((prev) => (prev === "back" ? "front" : "back"));

  // 📤 Enviar frame al servidor Python (YOLO)
  const sendFrame = async () => {
    if (!cameraRef.current || !cameraReady) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.15,
        skipProcessing: true,
      });

      // Reducir tamaño para enviar más rápido
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 240 } }],
        { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const response = await fetch(SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_b64: resized.base64 }),
      });

      const data = await response.json();

      if (data.ok) {
        setProcessedFrame(`data:image/jpeg;base64,${data.overlay_jpg_b64}`);
        setDetecciones(data.boxes);
      }
    } catch (err) {
      console.log("❌ Error enviando frame:", err.message);
    }
  };

  // 🔁 Iniciar stream
  useEffect(() => {
    let interval = null;

    if (cameraReady) {
      setIsStreaming(true);
      interval = setInterval(() => sendFrame(), 650); // un frame cada 0.65 s
    }

    return () => clearInterval(interval);
  }, [cameraReady]);

  // Pantallas de permisos
  if (!permission) {
    return (
      <View style={styles.center}>
        <Text>Verificando permisos...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>Se requiere permiso para usar la cámara.</Text>
        <Button title="Permitir cámara" onPress={requestPermission} />
      </View>
    );
  }

  // 🖥️ UI
  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          facing={facing}
          style={styles.camera}
          onCameraReady={() => setCameraReady(true)}
        />
        {isStreaming && (
          <View style={styles.processingBadge}>
            <Text style={styles.processingText}>Analizando...</Text>
          </View>
        )}
      </View>

      <View style={styles.controlsRow}>
        <Button title="Cambiar cámara" onPress={toggleFacing} />
      </View>

      <View style={styles.output}>
        <Text style={styles.label}>Resultado YOLO11X-SEG:</Text>

        {processedFrame ? (
          <Image source={{ uri: processedFrame }} style={styles.outputImage} />
        ) : (
          <ActivityIndicator size="large" color="#007AFF" />
        )}

        {detecciones.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.distLabel}>Objetos detectados:</Text>
            {detecciones.map((d, i) => (
              <Text key={i} style={styles.distText}>
                • {d.label} — conf {d.conf.toFixed(2)}
              </Text>
            ))}
          </View>
        )}

        {detecciones.length === 0 && processedFrame && (
          <Text style={{ marginTop: 10, color: "#777" }}>
            No se detectaron objetos.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5", padding: 10 },
  cameraContainer: {
    width: "100%",
    height: 350,
    borderRadius: 15,
    overflow: "hidden",
    marginBottom: 10,
    backgroundColor: "#000",
  },
  camera: { flex: 1 },
  output: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  label: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 8,
    color: "#111827",
  },
  outputImage: {
    width: "90%",
    height: 300,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  controlsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  processingBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  processingText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  distLabel: {
    fontWeight: "600",
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
  },
  distText: {
    fontSize: 14,
    color: "#444",
  },
});
