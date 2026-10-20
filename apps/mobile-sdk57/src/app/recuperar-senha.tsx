import { Link } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styles } from '@/components/access-screen';
export default function Screen() { return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}><Link href="/" style={styles.back}>← Voltar ao início</Link><Text accessibilityRole="header" style={styles.title}>Recuperar minha senha</Text><Text style={styles.description}>A recuperação por e-mail será disponibilizada após a integração com o servidor.</Text></ScrollView></SafeAreaView>; }
