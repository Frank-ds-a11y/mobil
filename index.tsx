// --- (IMPORTS IGUALES) ---
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as Speech from "expo-speech";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState("back");
  const [isStreaming, setIsStreaming] = useState(true);
  const [processedFrame, setProcessedFrame] = useState(null);
  const [detecciones, setDetecciones] = useState([]);

  const cameraRef = useRef(null);

  // --------------------------
  // 🔔 Vibración
  // --------------------------
  const vibrar = () => {
    Vibration.vibrate(400);
  };

  // --------------------------
  // 🔊 Control de voz
  // --------------------------
  const lastSpokenRef = useRef(0);
  const lastSentenceRef = useRef(null);

  const speakDirection = (sentence) => {
    const now = Date.now();

    if (sentence === lastSentenceRef.current && now - lastSpokenRef.current < 2500) return;

    lastSentenceRef.current = sentence;
    lastSpokenRef.current = now;

    Speech.stop();
    Speech.speak(sentence, {
      language: "es-MX",
      rate: 0.85,
      pitch: 1.0,
    });
  };

  // --------------------------
  // IP DEL SERVIDOR PYTHON
  // --------------------------
  const SERVER_URL = "http://192.168.100.3:8000/stream_infer";

  // --------------------------
  // PERMISOS
  // --------------------------
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission]);

  const toggleFacing = () =>
    setFacing((prev) => (prev === "back" ? "front" : "back"));

  // --------------------------
  // 📤 ENVIAR FRAME
  // --------------------------
  const sendFrame = async () => {
    if (!cameraRef.current || !cameraReady || !isStreaming) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.15,
        skipProcessing: true,
      });

      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 350 } }],
        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const response = await fetch(SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_b64: resized.base64 }),
      });

      const data = await response.json();

      if (data.ok) {
        setProcessedFrame(`data:image/jpeg;base64,${data.overlay_jpg_b64}`);

        let objetos = data.objects || [];

        objetos = objetos.filter((o) => o.distance_m <= 10);
        objetos.sort((a, b) => a.distance_m - b.distance_m);
        objetos = objetos.slice(0, 2);

        setDetecciones(objetos);

        if (objetos.length > 0) {
          vibrar();
          const descripcion = objetos.map((o) => `${o.label} ${o.direction}`).join(" y ");
          speakDirection(descripcion);
        }
      }
    } catch (err) {
      console.log("❌ Error enviando frame:", err.message);
    }
  };

  // --------------------------
  // 🔁 STREAM LOOP
  // --------------------------
  useEffect(() => {
    let interval = null;

    if (cameraReady && isStreaming) {
      interval = setInterval(() => sendFrame(), 700);
    }

    return () => clearInterval(interval);
  }, [cameraReady, isStreaming]);

  // --------------------------
  // UI — PERMISOS
  // --------------------------
  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text>Se requiere permiso de cámara</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text>Permitir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --------------------------
  // UI GENERAL
  // --------------------------
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        facing={facing}
        style={styles.camera}
        onCameraReady={() => setCameraReady(true)}
      />

      {/* 🟥 Imagen con cajas del servidor superpuesta */}
      {processedFrame && (
        <Image source={{ uri: processedFrame }} style={styles.overlayFrame} />
      )}

      {/* 🟦 BADGE ANALIZANDO (solo si está activo) */}
      {isStreaming && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Analizando...</Text>
        </View>
      )}

      {/* 🟢 BOTONES INFERIORES */}
      <View style={styles.bottomControls}>
        {/* Cambiar cámara */}
        <TouchableOpacity style={styles.btnCircle} onPress={toggleFacing}>
          <MaterialIcons name="flip-camera-android" size={30} color="#fff" />
        </TouchableOpacity>

        {/* Botón principal — PAUSAR / REANUDAR */}
        <TouchableOpacity
          style={[styles.btnMain, { backgroundColor: isStreaming ? "#007AFF" : "#555" }]}
          onPress={() => setIsStreaming((prev) => !prev)}
        >
          <Ionicons name={isStreaming ? "pause" : "play"} size={40} color="#fff" />
        </TouchableOpacity>

        {/* Configuración */}
        <TouchableOpacity style={styles.btnCircle}>
          <Ionicons name="settings" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --------------------------------------
// ESTILOS
// --------------------------------------
const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  camera: {
    width: "100%",
    height: "100%",
    position: "absolute",
    top: 0,
    left: 0,
  },

  overlayFrame: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0.85,
  },

  badge: {
    position: "absolute",
    top: 40,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  bottomControls: {
    position: "absolute",
    bottom: 25,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
  },

  btnCircle: {
    width: 60,
    height: 60,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },

  btnMain: {
    width: 80,
    height: 80,
    borderRadius: 80,
    justifyContent: "center",
    alignItems: "center",
  },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
