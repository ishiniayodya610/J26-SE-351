import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { 
  Activity, 
  Cpu, 
  Camera, 
  AlertTriangle, 
  Sparkles, 
  SlidersHorizontal,
  Fish,
  User
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
          title: 'Live',
          headerTitle: 'AquaGuard • Live Telemetry',
          tabBarIcon: ({ color, size }) => <Activity color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="tanks"
        options={{
          title: 'Tanks',
          headerTitle: 'AquaGuard • My Aquariums',
          tabBarIcon: ({ color, size }) => <Fish color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Vision',
          headerTitle: 'AquaGuard • Vision Monitor',
          tabBarIcon: ({ color, size }) => <Camera color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="disease"
        options={{
          title: 'AI Health',
          headerTitle: 'AquaGuard • AI Disease & Risk',
          tabBarIcon: ({ color, size }) => <AlertTriangle color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="auth"
        options={{
          title: 'Account',
          headerTitle: 'AquaGuard • User Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={20} />,
        }}
      />
      {/* Secondary & Diagnostic Screens (Accessible via in-app links & AI Suite Switcher) */}
      <Tabs.Screen
        name="gatekeeper"
        options={{
          href: null,
          headerTitle: 'AquaGuard • TinyML Gatekeeper',
        }}
      />
      <Tabs.Screen
        name="xai"
        options={{
          href: null,
          headerTitle: 'AquaGuard • Explainable AI (XAI)',
        }}
      />
      {/* Non-tab modal and utility screens */}
      <Tabs.Screen
        name="provision"
        options={{
          href: null,
          headerTitle: 'Pair ESP32 IoT Device',
        }}
      />
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
