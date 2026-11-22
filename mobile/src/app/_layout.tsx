import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { 
  Activity, 
  Cpu, 
  Camera, 
  AlertTriangle, 
  Sparkles, 
  SlidersHorizontal 
} from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0B0F19',
          borderBottomColor: '#1E293B',
          borderBottomWidth: 1,
        },
        headerTintColor: '#00E5FF',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
        tabBarStyle: {
          backgroundColor: '#0B0F19',
          borderTopColor: '#1E293B',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#00E5FF',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tank Health',
          headerTitle: 'AquaGuard • Live Telemetry',
          tabBarIcon: ({ color, size }) => <Activity color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="gatekeeper"
        options={{
          title: 'TinyML Edge',
          headerTitle: 'Edge Impulse TinyML Gatekeeper',
          tabBarIcon: ({ color, size }) => <Cpu color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Vision',
          headerTitle: 'Vision Monitor',
          tabBarIcon: ({ color, size }) => <Camera color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="disease"
        options={{
          title: 'Disease Risk',
          headerTitle: 'Ammonia & Whitespot Predictor',
          tabBarIcon: ({ color, size }) => <AlertTriangle color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="xai"
        options={{
          title: 'XAI Hub',
          headerTitle: 'Explainable AI Root Cause Hub',
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={20} />,
        }}
      />
      {/* Hide unused screens */}
      <Tabs.Screen
        name="testbed"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
