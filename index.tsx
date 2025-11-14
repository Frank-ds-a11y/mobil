import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  StyleSheet,
  Button,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState("back");
  const [isStreaming, setIsStreaming] = useState(false);
  const [processedFrame, setProcessedFrame] = useState(null);
  const [alerta, setAlerta] = useState(false);
  const [distancias, setDistancias] = useState([]);
  const cameraRef = useRef(null);

  // ⚙️ Tu IP local (ajústala según tu red)
  const SERVER_URL = "http://192.168.1.195:8000/stream_infer";

  // 🔸 Pedir permisos al iniciar
  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, []);

  const toggleFacing = () =>
    setFacing((prev) => (prev === "back" ? "front" : "back"));

  // 📤 Enviar un frame al servidor
  const sendFrame = async () => {
    if (!cameraRef.current || !cameraReady) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.1,
        skipProcessing: true,
      });

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
      if (data.ok && data.overlay_jpg_b64) {
        setProcessedFrame(`data:image/jpeg;base64,${data.overlay_jpg_b64}`);
        setAlerta(data.alerta);
        setDistancias(data.boxes.map((b) => b.distance_m));
      }
    } catch (err) {
      console.error("Error al enviar frame:", err.message);
    }
  };

  // 🔁 Streaming automático
  useEffect(() => {
    let interval = null;
    if (cameraReady) {
      setIsStreaming(true);
      interval = setInterval(() => sendFrame(), 600); // intervalo de envío rápido
    }
    return () => clearInterval(interval);
  }, [cameraReady]);

  // ⚠️ Mostrar alerta visual cuando alguien esté cerca
  useEffect(() => {
    if (alerta) {
      console.log("⚠ Persona muy cerca!");
    }
  }, [alerta]);

  // Manejo de permisos
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

  // 🖥️ Interfaz principal
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
            <Text style={styles.processingText}>Analizando en tiempo real...</Text>
          </View>
        )}
      </View>

      <View style={styles.controlsRow}>
        <Button title="Cambiar cámara" onPress={toggleFacing} />
      </View>

      <View style={styles.output}>
        <Text style={styles.label}>Resultado del análisis:</Text>

        {processedFrame ? (
          <Image source={{ uri: processedFrame }} style={styles.outputImage} />
        ) : (
          <ActivityIndicator size="large" color="#007AFF" />
        )}

        {/* 🔹 Mostrar distancias detectadas */}
        {distancias.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.distLabel}>Distancias detectadas:</Text>
            {distancias.map((d, i) => (
              <Text key={i} style={styles.distText}>
                Persona {i + 1}: {d} m
              </Text>
            ))}
          </View>
        )}

        {/* 🔹 Alerta visual */}
        {alerta && (
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>⚠ ¡Persona muy cerca!</Text>
          </View>
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
  alertBox: {
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,0,0,0.8)",
    borderRadius: 8,
  },
  alertText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
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
