import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Cpu, Sparkles } from 'lucide-react-native';
import { triggerSelectionHaptic } from '@/services/haptics';

interface Props {
  activeTab: 'disease' | 'gatekeeper' | 'xai';
}

export default function AiSuiteSwitcher({ activeTab }: Props) {
  const router = useRouter();

  const handleTabPress = (route: string) => {
    triggerSelectionHaptic();
    router.replace(route as any);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'disease' && styles.tabActive]}
        onPress={() => handleTabPress('/disease')}
        activeOpacity={0.8}
      >
        <AlertTriangle 
          size={14} 
          color={activeTab === 'disease' ? '#00E5FF' : '#64748B'} 
        />
        <Text style={[styles.tabText, activeTab === 'disease' && styles.tabTextActive]}>
          Disease
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'gatekeeper' && styles.tabActive]}
        onPress={() => handleTabPress('/gatekeeper')}
        activeOpacity={0.8}
      >
        <Cpu 
          size={14} 
          color={activeTab === 'gatekeeper' ? '#00E5FF' : '#64748B'} 
        />
        <Text style={[styles.tabText, activeTab === 'gatekeeper' && styles.tabTextActive]}>
          TinyML
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'xai' && styles.tabActive]}
        onPress={() => handleTabPress('/xai')}
        activeOpacity={0.8}
      >
        <Sparkles 
          size={14} 
          color={activeTab === 'xai' ? '#00E5FF' : '#64748B'} 
        />
        <Text style={[styles.tabText, activeTab === 'xai' && styles.tabTextActive]}>
          XAI Hub
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#0F2C4C',
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
});
