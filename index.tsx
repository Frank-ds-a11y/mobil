import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Dimensions,
  SafeAreaView,
  StatusBar,
  ScrollView
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as Speech from "expo-speech";

// Obtener dimensiones de pantalla
const { width } = Dimensions.get("window");

// --- CONSTANTES DE IDIOMA ---
const LANGUAGES = ['es', 'en']; // Solo Español e Inglés
const LANGUAGE_NAMES = { 'es': 'Español (ES)', 'en': 'English (EN)' };

// --- DICCIONARIO DE TEXTOS ---
const L = {
  es: {
    appSubtitle: "Tu asistente\nvisual inteligente",
    footerText: "Toque dos veces para iniciar",
    scanStart: "Iniciando escaneo",
    voiceInstruction: "Toque dos veces para iniciar escaneo",
    settingsTitle: "Configuración",
    back: "Detener",
    backSettings: "Volver",
    language: "Idioma",
    switchLangButton: "Cambiar Idioma",
    vibrationTitle: "Habilitar Vibración",
    vibrationOn: "Vibración: Activa",
    vibrationOff: "Vibración: Desactivada",
    // ** NUEVAS CLAVES PARA INTENSIDAD DE VIBRACIÓN **
    detectionIntensity: "Intensidad de Vibración (Nivel 1-10)",
    intensityUnit: "Nivel",
    intensityInfo: "Define la duración de la vibración (duración: ",
    current: "Configuración actual: ",
    camPermReq: "Se requiere permiso de cámara",
    allow: "Permitir"
  },
  en: {
    appSubtitle: "Your intelligent\nvisual assistant",
    footerText: "Double tap to start",
    scanStart: "Starting scan",
    voiceInstruction: "Double tap to start scanning",
    settingsTitle: "Settings",
    back: "Stop",
    backSettings: "Back",
    language: "Language",
    switchLangButton: "Switch Language",
    vibrationTitle: "Enable Vibration",
    vibrationOn: "Vibration: Enabled",
    vibrationOff: "Vibration: Disabled",
    // ** NUEVAS CLAVES PARA INTENSIDAD DE VIBRACIÓN **
    detectionIntensity: "Vibration Intensity (Level 1-10)",
    intensityUnit: "Level",
    intensityInfo: "Defines the duration of the vibration (duration: ",
    current: "Current setting: ",
    camPermReq: "Camera permission is required",
    allow: "Allow"
  }
};

// --------------------------------------
// ⚙️ COMPONENTE: PANTALLA DE CONFIGURACIÓN
// --------------------------------------
const SettingsScreen = ({ 
    language, 
    setLanguage, 
    setScreen, 
    isVibrationEnabled, 
    setIsVibrationEnabled,
    vibrationIntensity, // Ahora es intensidad de vibración
    setVibrationIntensity // Ahora es el setter de intensidad
}) => {
  const t = L[language];
  const intensityMax = 10; // Nivel máximo
  const intensityMin = 1; // Nivel mínimo

  // Lógica de cambio de idioma (es <-> en)
  const handleLangSwitch = () => {
    setLanguage(prevLang => prevLang === 'es' ? 'en' : 'es');
  };
  
  // Handlers para el control de intensidad de vibración
  const handleIncreaseIntensity = () => {
    setVibrationIntensity(prev => Math.min(prev + 1, intensityMax));
  };

  const handleDecreaseIntensity = () => {
    setVibrationIntensity(prev => Math.max(prev - 1, intensityMin));
  };
  
  // Helper para mostrar la duración en milisegundos
  const getVibrationDuration = (intensity) => intensity * 100;

  return (
    <ScrollView style={settingsStyles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        {/* Header */}
        <View style={settingsStyles.header}>
          <TouchableOpacity onPress={() => setScreen("home")} style={settingsStyles.backButton}>
            <Text style={settingsStyles.backText}>{"<"} {t.backSettings}</Text>
          </TouchableOpacity>
          <Text style={settingsStyles.title}>{t.settingsTitle}</Text>
          <View style={{ width: 60 }} /> 
        </View>

        {/* Sección 1: Idioma */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>{t.language}</Text>
          <View style={settingsStyles.optionContainer}>
            <Text style={settingsStyles.optionLabel}>
              {LANGUAGE_NAMES[language]}
            </Text>
            {/* BOTÓN GRANDE: Cambiar Idioma */}
            <TouchableOpacity
              style={settingsStyles.langButton}
              onPress={handleLangSwitch}
            >
              <Text style={settingsStyles.langText}>{t.switchLangButton}</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Sección 2: Habilitar Vibración */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>{t.vibrationTitle}</Text>
          <View style={settingsStyles.optionContainer}>
            <Text style={settingsStyles.optionLabel}>
              {isVibrationEnabled ? t.vibrationOn : t.vibrationOff}
            </Text>
            {/* BOTÓN GRANDE: ON/OFF Vibración */}
            <TouchableOpacity
              style={[settingsStyles.toggleButton, isVibrationEnabled ? settingsStyles.toggleOn : settingsStyles.toggleOff]}
              onPress={() => setIsVibrationEnabled(!isVibrationEnabled)}
            >
              <Text style={settingsStyles.toggleText}>
                {isVibrationEnabled ? 'OFF' : 'ON'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sección 3: Intensidad de Vibración (Antes Distancia) */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>{t.detectionIntensity}</Text>
          
          <View style={settingsStyles.sliderContainer}>
            {/* BOTÓN GRANDE: Decrementar (-) */}
            <TouchableOpacity
              style={[settingsStyles.sliderButton, vibrationIntensity === intensityMin && {opacity: 0.5}]}
              onPress={handleDecreaseIntensity}
              disabled={vibrationIntensity === intensityMin}
            >
              <Text style={settingsStyles.sliderButtonText}>-</Text>
            </TouchableOpacity>

            {/* Valor Actual */}
            <Text style={settingsStyles.distanceValue}>
              {vibrationIntensity} {t.intensityUnit}
            </Text>

            {/* BOTÓN GRANDE: Incrementar (+) */}
            <TouchableOpacity
              style={[settingsStyles.sliderButton, vibrationIntensity === intensityMax && {opacity: 0.5}]}
              onPress={handleIncreaseIntensity}
              disabled={vibrationIntensity === intensityMax}
            >
              <Text style={settingsStyles.sliderButtonText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={settingsStyles.infoTextDescription}>
              {t.intensityInfo} {getVibrationDuration(vibrationIntensity)}ms)
          </Text>
        </View>
        
      </SafeAreaView>
    </ScrollView>
  );
};

// --------------------------------------
// 📱 COMPONENTE PRINCIPAL (APP)
// --------------------------------------
export default function App() {
  // --- ESTADOS ---
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState("back");

  // Navegación: 'home' | 'scanning' | 'settings'
  const [currentScreen, setCurrentScreen] = useState("home");
  
  // Configuración de la aplicación
  const [language, setLanguage] = useState("es");
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(true); 
  // Intensidad de vibración (1-10), reemplaza a detectionDistance
  const [vibrationIntensity, setVibrationIntensity] = useState(5); 

  const [processedFrame, setProcessedFrame] = useState(null);

  const cameraRef = useRef(null);
  const lastSpokenRef = useRef(0);
  const lastSentenceRef = useRef(null);
  
  // Ref para la lógica de doble toque
  const lastTapRef = useRef(0);
  const DOUBLE_PRESS_DELAY = 300; 

  // --- CONFIGURACIÓN ---
  // ⚠️ CAMBIA ESTO POR TU IP REAL SI CAMBIA
  const SERVER_URL = "http://172.20.30.101:8000/stream_infer";

  // --- LÓGICA DE DOBLE TOQUE ---
  const handleDoubleTap = () => {
    const now = Date.now();

    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      // Doble Toque Detectado
      if (currentScreen === "home") {
        Speech.speak(L[language].scanStart, { 
            language: language === "es" ? "es-MX" : "en-US" 
        });
        setCurrentScreen("scanning");
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  // --- EFECTOS ---
  // 1. Permisos
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission]);

  // 2. Voz de Instrucción (Solo en pantalla HOME)
  useEffect(() => {
    let timeoutId;
    
    if (currentScreen === "home" && permission?.granted) {
      Speech.stop();
      
      timeoutId = setTimeout(() => {
        // 🔊 Mensaje de voz se obtiene del diccionario L
        Speech.speak(L[language].voiceInstruction, {
          language: language === "es" ? "es-MX" : "en-US",
          rate: 0.9
        });
      }, 50);
    }
    
    return () => {
        Speech.stop();
        clearTimeout(timeoutId);
    };
  }, [currentScreen, permission, language]); 

  // 3. Loop de envío de frames (Solo si estamos en SCANNING)
  useEffect(() => {
    let interval = null;
    if (currentScreen === "scanning" && cameraReady) {
      interval = setInterval(() => sendFrame(), 700); 
    } else {
      clearInterval(interval);
      Speech.stop(); // Detener voz al salir del escaneo
    }
    return () => clearInterval(interval);
  }, [currentScreen, cameraReady]);

  // --- FUNCIONES AUXILIARES ---

  // Mapea la intensidad de 1-10 a una duración de vibración de 100ms a 1000ms
  const getVibrationDuration = (intensity) => intensity * 100;

  const vibrar = () => {
    if (isVibrationEnabled) { 
        const duration = getVibrationDuration(vibrationIntensity);
        Vibration.vibrate(duration);
    }
  };

  const speakDirection = (sentence) => {
    const now = Date.now();
    if (sentence === lastSentenceRef.current && now - lastSpokenRef.current < 2500) return;

    lastSentenceRef.current = sentence;
    lastSpokenRef.current = now;

    Speech.stop();
    Speech.speak(sentence, { 
        language: language === "es" ? "es-MX" : "en-US", 
        rate: 0.85, 
        pitch: 1.0 
    });
  };

  const toggleFacing = () => setFacing((prev) => (prev === "back" ? "front" : "back"));

  // --- LÓGICA DE CÁMARA ---
  const sendFrame = async () => {
    if (!cameraRef.current || currentScreen !== "scanning") return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.10,
        skipProcessing: true,
      });

      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 240 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
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
        // Filtramos objetos a una distancia máxima fija de 10m.
        objetos = objetos.filter((o) => o.distance_m <= 10); 
        objetos = objetos.slice(0, 2);

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

  // --- RENDERIZADO ---
  const t = L[language]; // Referencia rápida al diccionario de textos

  // 1. Pantalla de Permisos
  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={{color: '#fff', marginBottom: 20}}>{t.camPermReq}</Text>
        <TouchableOpacity style={styles.btnBlue} onPress={requestPermission}>
          <Text style={styles.btnText}>{t.allow}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 2. Pantalla: CONFIGURACIÓN
  if (currentScreen === "settings") {
      return (
          <SettingsScreen 
            language={language}
            setLanguage={setLanguage}
            setScreen={setCurrentScreen}
            isVibrationEnabled={isVibrationEnabled}
            setIsVibrationEnabled={setIsVibrationEnabled}
            vibrationIntensity={vibrationIntensity}
            setVibrationIntensity={setVibrationIntensity}
          />
      );
  }

  // 3. Pantalla: INICIO (Modo Doble Toque)
  if (currentScreen === "home") {
    return (
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={1}
        onPress={handleDoubleTap}
      >
        <SafeAreaView style={styles.homeContainer}>
          <StatusBar barStyle="light-content" />

          {/* BOTÓN CONFIGURACIÓN */}
          <TouchableOpacity 
            onPress={() => setCurrentScreen("settings")} 
            style={styles.settingsIcon}
            onPressIn={(e) => e.stopPropagation()} 
          >
            <Ionicons name="settings-outline" size={32} color="#E0E0E0" />
          </TouchableOpacity>

          <View style={styles.eyeContainer}>
            <Ionicons name="eye-outline" size={100} color="#E0E0E0" />
          </View>

          <Text style={styles.appTitle}>Eyep!</Text>
          <Text style={styles.appSubtitle}>
            {t.appSubtitle}
          </Text>

          <View style={{ height: 66, marginBottom: 30 }} /> 

          <Text style={styles.footerText}>
            {t.footerText}
          </Text>
        </SafeAreaView>
      </TouchableOpacity>
    );
  }

  // 4. Pantalla: CÁMARA (Modo Escaneo)
  return (
    <View style={styles.cameraContainer}>
      <StatusBar hidden />
      <CameraView
        ref={cameraRef}
        facing={facing}
        style={styles.fullScreenCamera}
        onCameraReady={() => setCameraReady(true)}
      />
      {processedFrame && (
        <Image source={{ uri: processedFrame }} style={styles.overlayImage} />
      )}
      <View style={styles.cameraControls}>
        {/* Botón DETENER */}
        <TouchableOpacity style={styles.btnBack} onPress={() => setCurrentScreen("home")}>
          <Ionicons name="close" size={34} color="#fff" />
          <Text style={styles.btnBackText}>{t.back}</Text>
        </TouchableOpacity>
        {/* Botón FLIP */}
        <TouchableOpacity style={styles.btnFlip} onPress={toggleFacing}>
          <Ionicons name="camera-reverse-outline" size={34} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- ESTILOS PRINCIPALES ---
const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeContainer: {
    flex: 1,
    backgroundColor: "#121212", 
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    width: '100%',
  },
  settingsIcon: {
    position: 'absolute',
    top: 50, 
    right: 25,
    zIndex: 10,
    padding: 15, 
  },
  eyeContainer: {
    marginBottom: 20,
    marginTop: 50,
  },
  appTitle: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
    letterSpacing: 1,
  },
  appSubtitle: {
    fontSize: 20,
    color: "#ccc",
    textAlign: "center",
    marginBottom: 60,
    lineHeight: 28,
  },
  footerText: {
    color: "#888",
    fontSize: 14,
    marginTop: 20,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  fullScreenCamera: {
    width: "100%",
    height: "100%",
  },
  overlayImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  cameraControls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  btnBack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    paddingVertical: 15, 
    paddingHorizontal: 30, 
    borderRadius: 30, 
  },
  btnBackText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8, 
    fontSize: 18, 
  },
  btnFlip: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 18, 
    borderRadius: 35, 
  },
  btnBlue: {
    backgroundColor: "#2CCBFF",
    paddingVertical: 15, 
    paddingHorizontal: 30, 
    borderRadius: 10, 
  },
  btnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 18, 
  }
});

// --- ESTILOS DE CONFIGURACIÓN (Dark Mode) ---
const settingsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212", 
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
    paddingTop: 40,
  },
  backButton: {
    padding: 10,
  },
  backText: {
    fontSize: 20, 
    color: "#2CCBFF", 
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  section: {
    marginBottom: 25, 
    padding: 20, 
    backgroundColor: "#1C1C1C", 
    borderRadius: 12, 
  },
  sectionTitle: {
    fontSize: 19, 
    fontWeight: "600",
    color: "#E0E0E0",
    marginBottom: 10,
  },
  optionContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10, 
  },
  optionLabel: {
    fontSize: 18, 
    color: "#B0B0B0",
  },
  // Botones de acción (Cambiar Idioma, ON/OFF)
  langButton: {
    // AUMENTO DE TAMAÑO: Más padding y tamaño de fuente
    paddingHorizontal: 25, 
    paddingVertical: 15, 
    borderRadius: 12, 
    minWidth: 150, // Asegurar un ancho mínimo
    alignItems: 'center',
  },
  langText: {
    color: "#2CCBFF",
    fontWeight: "bold",
    fontSize: 20, // Aumentado
  },
  toggleButton: {
    // AUMENTO DE TAMAÑO: Más padding y tamaño de fuente
    paddingHorizontal: 30, 
    paddingVertical: 15, 
    borderRadius: 12, 
    minWidth: 100,
    alignItems: 'center',
  },
  toggleText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20, // Aumentado
  },
  // Estilos específicos para el toggle de vibración
  toggleOn: {
    backgroundColor: "#333333", 
    borderColor: '#4A4A4A',
    borderWidth: 1,
  },
  toggleOff: {
    backgroundColor: "#2CCBFF", 
  },
  // Estilos para la simulación del deslizador
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15, 
  },
  sliderButton: {
    // AUMENTO DE TAMAÑO: Más padding para los botones +/-
    backgroundColor: '#333333',
    paddingHorizontal: 25, 
    paddingVertical: 20, // Aumentado
    borderRadius: 10, 
  },
  sliderButtonText: {
    color: '#2CCBFF',
    fontWeight: 'bold',
    fontSize: 28, // Aumentado
    width: 30, // Aumentado
    textAlign: 'center',
  },
  distanceValue: {
    flex: 1, 
    textAlign: 'center',
    fontSize: 24, // Aumentado
    fontWeight: '600',
    color: '#E0E0E0',
  },
  infoTextDescription: {
    fontSize: 16, // Aumentado
    color: "#777777",
    marginTop: 5,
  },
});
