import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, Button, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

// !!! ⚠️ CONFIGURACIÓN DE IP ⚠️ !!!
// ASEGÚRATE DE QUE ESTA IP COINCIDA CON LA IP LOCAL DE TU PC DONDE CORRE FASTAPI
const API_URL = 'http://192.168.1.193:8000/infer'; 

// Interfaz unificada para manejar Bounding Boxes de Muros y Personas
interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: 'wall' | 'person'; // Etiqueta para distinguir el tipo
  area?: number; // Propiedad opcional (solo para Muros)
  confidence?: number; // Propiedad opcional (solo para Personas)
}

const App: React.FC = () => {
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [resultImageB64, setResultImageB64] = useState<string | null>(null);
  // Listas separadas para mostrar los resultados de forma clara
  const [personBoxes, setPersonBoxes] = useState<BoundingBox[]>([]);
  const [wallBoxes, setWallBoxes] = useState<BoundingBox[]>([]);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /** Pide permiso y selecciona la imagen de la galería */
  const pickImage = async () => {
    setError(null);
    setResultImageB64(null);
    setPersonBoxes([]);
    setWallBoxes([]);
    
    // Solicitar permisos en plataformas que lo requieran
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso Requerido', 'Necesitamos permiso para acceder a la galería para que esto funcione.');
        return;
      }
    }

    // Lanzar el selector de imágenes
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSelectedImageUri(uri);
      uploadImage(uri);
    }
  };

  /** Envía la imagen al servidor FastAPI */
  const uploadImage = async (uri: string) => {
    setLoading(true);

    try {
      // Convertir URI local a Blob y crear FormData
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'photo.jpg';
      const fileType = filename.split('.').pop() === 'png' ? 'image/png' : 'image/jpeg';

      formData.append('file', {
        uri: uri,
        name: filename,
        type: fileType,
      } as any);

      // Enviar la solicitud POST al servidor FastAPI
      const apiResponse = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      if (!apiResponse.ok) {
        throw new Error(`HTTP error! Estado: ${apiResponse.status}`);
      }

      const data = await apiResponse.json();

      if (data.ok) {
        setResultImageB64(`data:image/jpeg;base64,${data.overlay_jpg_b64}`);
        
        // Separar las cajas recibidas por etiqueta
        const allBoxes: BoundingBox[] = data.boxes;
        setWallBoxes(allBoxes.filter(box => box.label === 'wall'));
        setPersonBoxes(allBoxes.filter(box => box.label === 'person'));

      } else {
        setError("Error en la inferencia del servidor.");
      }

    } catch (e: any) {
      console.error("Upload error:", e);
      setError(`Fallo al conectar: ${e.message}. Asegúrate de que el servidor esté corriendo en ${API_URL.split('/infer')[0]}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Detector de Muros 🧱 y Personas 🧍</Text>
        <Text style={styles.subtitle}>
            IP de Conexión: <Text style={styles.ipText}>{API_URL.split('/infer')[0]}</Text>
        </Text>
        
        <View style={styles.buttonContainer}>
            <Button 
                title={selectedImageUri ? "Seleccionar otra imagen" : "Seleccionar Imagen"} 
                onPress={pickImage} 
                color="#2563eb"
                disabled={loading}
            />
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Procesando Muros y Personas...</Text>
          </View>
        )}

        {error && (
            <Text style={styles.errorText}>Error: {error}</Text>
        )}

        {resultImageB64 && (
          <View style={styles.resultContainer}>
            <Text style={styles.sectionTitle}>Resultado de Detección</Text>
            <Text style={styles.infoText}>Muros: Rojo | Personas: Verde</Text>
            
            {/* Imagen de Superposición */}
            <Image 
                source={{ uri: resultImageB64 }} 
                style={styles.image} 
                resizeMode="contain"
            />
            
            {/* Lista de Personas */}
            <Text style={[styles.resultsText, { color: '#059669' }]}>
                Personas Detectadas: {personBoxes.length}
            </Text>
            <View style={styles.boxList}>
                {personBoxes.map((box, index) => (
                    <Text key={`p-${index}`} style={[styles.boxItem, { color: '#059669', fontWeight: 'bold' }]}>
                        🧍 Persona {index + 1}: Confianza {box.confidence?.toFixed(2)}, ({box.x}, {box.y}) - W:{box.w}, H:{box.h}
                    </Text>
                ))}
            </View>

            {/* Lista de Muros */}
            <Text style={[styles.resultsText, { color: '#dc2626', marginTop: 15 }]}>
                Muros Detectados: {wallBoxes.length} región(es)
            </Text>
            <View style={styles.boxList}>
                {wallBoxes.map((box, index) => (
                    <Text key={`w-${index}`} style={styles.boxItem}>
                        🧱 Muro {index + 1}: ({box.x}, {box.y}) - W:{box.w}, H:{box.h} (Área: {box.area})
                    </Text>
                ))}
            </View>
          </View>
        )}
        
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc', },
  container: { padding: 20, alignItems: 'center', paddingBottom: 40, },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#1e293b', textAlign: 'center', },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20, textAlign: 'center', },
  ipText: { fontWeight: 'bold', color: '#dc2626', },
  buttonContainer: { width: '100%', paddingHorizontal: 20, },
  loadingContainer: { marginTop: 30, alignItems: 'center', padding: 20, backgroundColor: '#e0f2fe', borderRadius: 10, width: '90%', },
  loadingText: { marginTop: 10, color: '#0ea5e9', fontWeight: '600', },
  errorText: { marginTop: 20, color: '#dc2626', fontWeight: 'bold', textAlign: 'center', paddingHorizontal: 15, },
  resultContainer: { marginTop: 30, width: '100%', alignItems: 'center', backgroundColor: '#ffffff', padding: 15, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5, },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color: '#1e293b', },
  infoText: { fontSize: 14, color: '#64748b', marginBottom: 15, },
  image: { width: '100%', height: 300, borderRadius: 8, backgroundColor: '#e2e8f0', marginBottom: 15, },
  resultsText: { fontSize: 16, fontWeight: '600', marginBottom: 10, },
  boxList: { width: '100%', paddingHorizontal: 10, },
  boxItem: { fontSize: 12, color: '#475569', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', }
});

export default App;