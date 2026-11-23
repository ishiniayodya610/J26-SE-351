import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { User, Lock, Mail, ShieldCheck, LogOut, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react-native';
import { authApi, setAuthToken, getAuthToken, initAuthSession, UserProfile } from '@/services/api';

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    const token = await initAuthSession();
    if (token) {
      try {
        const user = await authApi.getMe();
        setCurrentUser(user);
      } catch {
        await setAuthToken(null);
        setCurrentUser(null);
      }
    }
  };

  const handleAuth = async () => {
    setErrorMsg(null);
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (!isLogin && !fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const res = await authApi.login({
          email: email.trim().toLowerCase(),
          password: password,
        });
        setCurrentUser(res.user);
        Alert.alert('Welcome Back!', `Logged in as ${res.user.full_name}`, [
          { text: 'Go to Dashboard', onPress: () => router.replace('/') },
        ]);
      } else {
        const registered = await authApi.register({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password: password,
        });
        // Auto-login after registration
        const loginRes = await authApi.login({
          email: email.trim().toLowerCase(),
          password: password,
        });
        setCurrentUser(loginRes.user);
        Alert.alert('Account Created!', `Welcome to AquaGuard, ${registered.full_name}!`, [
          { text: 'Go to Dashboard', onPress: () => router.replace('/') },
        ]);
      }
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of your AquaGuard account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await authApi.logout();
          setCurrentUser(null);
        },
      },
    ]);
  };

  if (currentUser) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <User size={40} color="#00E5FF" />
          </View>
          <Text style={styles.profileName}>{currentUser.full_name}</Text>
          <Text style={styles.profileEmail}>{currentUser.email}</Text>

          <View style={styles.statusPill}>
            <ShieldCheck size={14} color="#00E676" />
            <Text style={styles.statusPillText}>ACCOUNT ACTIVE • AUTHENTICATED</Text>
          </View>

          <TouchableOpacity
            style={styles.dashboardBtn}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.dashboardBtnText}>Open Telemetry Dashboard</Text>
            <ArrowRight size={16} color="#0B0F19" />
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Session Status</Text>
          <View style={styles.infoRow}>
            <CheckCircle size={16} color="#00E676" />
            <Text style={styles.infoText}>JWT Bearer Token Active</Text>
          </View>
          <View style={styles.infoRow}>
            <CheckCircle size={16} color="#00E676" />
            <Text style={styles.infoText}>Multi-Tank Cloud Management Enabled</Text>
          </View>
          <View style={styles.infoRow}>
            <CheckCircle size={16} color="#00E676" />
            <Text style={styles.infoText}>IoT Device QR Provisioning Authorized</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={18} color="#FF5252" />
          <Text style={styles.logoutBtnText}>Log Out of AquaGuard</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <ShieldCheck size={36} color="#00E5FF" />
          </View>
          <Text style={styles.title}>AquaGuard Cloud</Text>
          <Text style={styles.subtitle}>
            {isLogin
              ? 'Sign in to monitor your IoT tanks and receive live AI alerts.'
              : 'Create an account to manage your aquariums and IoT hardware.'}
          </Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.switchContainer}>
          <TouchableOpacity
            style={[styles.switchBtn, isLogin && styles.switchBtnActive]}
            onPress={() => {
              setIsLogin(true);
              setErrorMsg(null);
            }}
          >
            <Text style={[styles.switchBtnText, isLogin && styles.switchBtnTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.switchBtn, !isLogin && styles.switchBtnActive]}
            onPress={() => {
              setIsLogin(false);
              setErrorMsg(null);
            }}
          >
            <Text style={[styles.switchBtnText, !isLogin && styles.switchBtnTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error Notification */}
        {errorMsg && (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color="#FF5252" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Form Fields */}
        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <User size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Sahan Sandaruwan"
                  placeholderTextColor="#475569"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="user@example.com"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor="#475569"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0B0F19" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isLogin ? 'Sign In to Account' : 'Register & Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24, marginTop: 10 },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', marginBottom: 6 },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  switchContainer: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  switchBtnActive: {
    backgroundColor: '#00E5FF',
  },
  switchBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  switchBtnTextActive: {
    color: '#0B0F19',
    fontWeight: '800',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF5252',
    gap: 8,
  },
  errorText: { color: '#FF8A80', fontSize: 12, flex: 1 },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  inputLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131B2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    height: 48,
    color: '#F8FAFC',
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#00E5FF',
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#0B0F19', fontSize: 15, fontWeight: '800' },
  profileCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
    marginTop: 10,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  profileEmail: { fontSize: 13, color: '#94A3B8', marginTop: 4, marginBottom: 14 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  statusPillText: { color: '#00E676', fontSize: 10, fontWeight: '800' },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00E5FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  dashboardBtnText: { color: '#0B0F19', fontSize: 12, fontWeight: '800' },
  infoCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 24,
    gap: 10,
  },
  infoTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: '#CBD5E1', fontSize: 12 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderWidth: 1,
    borderColor: '#FF5252',
    height: 48,
    borderRadius: 10,
    gap: 8,
  },
  logoutBtnText: { color: '#FF5252', fontSize: 14, fontWeight: '700' },
});
