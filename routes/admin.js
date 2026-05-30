import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
  ActivityIndicator, StatusBar, TextInput, Modal, Image, Linking
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

const API = 'https://caralert-backend-production.up.railway.app';
const SUPABASE_URL = 'https://bnzocjvauohxohulalye.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuem9janZhdW9oeG9odWxhbHllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MDQ3MjEsImV4cCI6MjA5NTA4MDcyMX0.UQpCnvgoYCkk4Ok8QHW6TnGXliaAaTngn7mWgxHqr-Q';

// Função que valida se um CPF é matematicamente correto
const validarCPF = (cpf) => {
  const numeros = cpf.replace(/\D/g, '');
  if (numeros.length !== 11) return false;
  // Rejeita CPFs com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1+$/.test(numeros)) return false;
  // Valida primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(numeros[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(numeros[9])) return false;
  // Valida segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(numeros[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(numeros[10])) return false;
  return true;
};

// Formata o CPF enquanto o usuário digita: 000.000.000-00
const formatarCPF = (texto) => {
  const numeros = texto.replace(/\D/g, '').slice(0, 11);
  return numeros
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export default function App() {
  const [alertas, setAlertas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [localizacao, setLocalizacao] = useState(null);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [modalTestemunha, setModalTestemunha] = useState(null);
  const [modalConfirmar, setModalConfirmar] = useState(null);
  const [modalAvistamento, setModalAvistamento] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [cor, setCor] = useState('');
  const [recompensa, setRecompensa] = useState('');
  const [tipo, setTipo] = useState('carro');
  const [chavePix, setChavePix] = useState('');
  const [fotoUri, setFotoUri] = useState(null);
  const [meuAlertaId, setMeuAlertaId] = useState(null);
  const [ultimoAvistamentoId, setUltimoAvistamentoId] = useState(null);
  const pollingRef = useRef(null);
  const [modalDecisao5dias, setModalDecisao5dias] = useState(false);
  const [numeroBo, setNumeroBo] = useState('');

  // Estados do cadastro de usuário
  const [usuarioId, setUsuarioId] = useState(null);
  const [modalUsuario, setModalUsuario] = useState(false);
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [cpfUsuario, setCpfUsuario] = useState('');
  const [telefoneUsuario, setTelefoneUsuario] = useState('');
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);

  // Estados do pagamento do caução
  const [modalPix, setModalPix] = useState(null);
  const [aguardandoPagamento, setAguardandoPagamento] = useState(false);
  const pollingPagamentoRef = useRef(null);

  // Estados do painel admin
  const [modalAdmin, setModalAdmin] = useState(false);
  const [modalSenhaAdmin, setModalSenhaAdmin] = useState(false);
  const [senhaAdmin, setSenhaAdmin] = useState('');
  const [statsAdmin, setStatsAdmin] = useState(null);
  const [carregandoAdmin, setCarregandoAdmin] = useState(false);
  const logoTapCount = useRef(0);
  const logoTapTimer = useRef(null);

  useEffect(() => {
    pedirPermissaoGPS();
    // Verifica se já existe usuário salvo no celular
    AsyncStorage.getItem('usuarioId').then(id => {
      if (id) {
        setUsuarioId(id);
        registrarTokenNotificacao(id);
      } else {
        // Se não tiver usuário, abre o modal de cadastro
        setModalUsuario(true);
      }
    });
    AsyncStorage.getItem('meuAlertaId').then(id => {
      if (id) setMeuAlertaId(id);
    });
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (meuAlertaId) iniciarPolling(meuAlertaId);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [meuAlertaId]);

  // Toque longo no logo abre o painel admin (3 toques rapidos)
  const handleLogoPress = () => {
    logoTapCount.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    logoTapTimer.current = setTimeout(() => {
      logoTapCount.current = 0;
    }, 1500);
    if (logoTapCount.current >= 5) {
      logoTapCount.current = 0;
      setSenhaAdmin('');
      setModalSenhaAdmin(true);
    }
  };

  const entrarAdmin = async () => {
    if (senhaAdmin !== 'AvisaAI@3036#') {
      Alert.alert('Senha incorreta', 'Tente novamente.');
      return;
    }
    setModalSenhaAdmin(false);
    setModalAdmin(true);
    carregarStatsAdmin();
  };

  const carregarStatsAdmin = async () => {
    setCarregandoAdmin(true);
    try {
      const res = await fetch(API + '/api/admin/stats?senha=' + encodeURIComponent('AvisaAI@3036#'));
      const data = await res.json();
      setStatsAdmin(data);
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel carregar os dados.');
    }
    setCarregandoAdmin(false);
  };

  const formatarMoeda = (valor) => {
    return 'R$ ' + parseFloat(valor || 0).toFixed(2).replace('.', ',');
  };

  const statusCor = (status) => {
    if (status === 'active') return '#2E7D32';
    if (status === 'found') return '#1565C0';
    if (status === 'cancelled') return '#B71C1C';
    if (status === 'pending') return '#E65100';
    return '#888';
  };

  const statusLabel = (status) => {
    if (status === 'active') return 'Ativo';
    if (status === 'found') return 'Encontrado';
    if (status === 'cancelled') return 'Cancelado';
    if (status === 'pending') return 'Aguard. pagto';
    return status;
  };

  const registrarTokenNotificacao = async (userId) => {
    try {
      if (!Device.isDevice) return;
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      await fetch(API + '/api/users/' + userId + '/token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token })
      });
      console.log('Token de notificacao salvo:', token);
    } catch (e) {
      console.log('Erro ao registrar token:', e.message);
    }
  };

  const salvarUsuario = async () => {
    // Validações
    if (!nomeUsuario.trim()) {
      Alert.alert('Campo obrigatório', 'Informe seu nome completo.');
      return;
    }
    if (!validarCPF(cpfUsuario)) {
      Alert.alert('CPF inválido', 'O CPF informado não é válido. Verifique e tente novamente.');
      return;
    }
    if (!telefoneUsuario.trim() || telefoneUsuario.replace(/\D/g, '').length < 10) {
      Alert.alert('Telefone inválido', 'Informe um número de telefone válido com DDD.');
      return;
    }

    setSalvandoUsuario(true);
    try {
      const res = await fetch(API + '/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nomeUsuario.trim(),
          cpf: cpfUsuario.replace(/\D/g, ''),
          phone: telefoneUsuario.replace(/\D/g, '')
        })
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Erro ao cadastrar', data.error || 'Tente novamente.');
        setSalvandoUsuario(false);
        return;
      }

      // Salva o ID do usuário no celular para próximas sessões
      await AsyncStorage.setItem('usuarioId', data.id);
      setUsuarioId(data.id);
      setModalUsuario(false);
      registrarTokenNotificacao(data.id);
      Alert.alert('Bem-vindo ao AvisaAI!', 'Cadastro realizado com sucesso, ' + data.name.split(' ')[0] + '!');
    } catch (e) {
      Alert.alert('Erro de conexão', e.message);
    }
    setSalvandoUsuario(false);
  };

  const iniciarPolling = (alertId) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      verificarAvistamentos(alertId);
    }, 30000);
  };

  const verificarAvistamentos = async (alertId) => {
    try {
      const res = await fetch(API + '/api/alerts/' + alertId + '/avistamentos');
      const data = await res.json();

      const agora = new Date();
      const alertCriadoEm = await AsyncStorage.getItem('alertaCriadoEm');
      if (alertCriadoEm) {
        const diasAtivo = (agora - new Date(alertCriadoEm)) / (1000 * 60 * 60 * 24);
        if (diasAtivo >= 5 && !modalDecisao5dias) {
          setModalDecisao5dias(true);
        }
      }

      if (!Array.isArray(data) || data.length === 0) return;

      const mais_recente = data[0];
      if (mais_recente.id !== ultimoAvistamentoId) {
        setUltimoAvistamentoId(mais_recente.id);
        setModalAvistamento({ alertId, avistamento: mais_recente });
      }
    } catch (e) {
      Alert.alert('Erro polling', e.message);
    }
  };

  const pedirPermissaoGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocalizacao(coords);
        buscarAlertas(coords.lat, coords.lng);
      } else {
        Alert.alert('GPS necessario', 'Ative o GPS para usar o AvisaAI.');
      }
    } catch (e) {
      console.log('Erro GPS:', e.message);
    }
  };

  const buscarAlertas = async (lat, lng) => {
    setCarregando(true);
    try {
      const res = await fetch(API + '/api/alerts/active?lat=' + lat + '&lng=' + lng);
      const data = await res.json();
      setAlertas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('Erro alertas:', e.message);
    }
    setCarregando(false);
  };

  const abrirCadastro = () => {
    if (!usuarioId) {
      setModalUsuario(true);
      return;
    }
    if (!localizacao) {
      Alert.alert('GPS nao encontrado', 'Aguarde o GPS ser ativado.');
      return;
    }
    setModalCadastro(true);
  };

  const tirarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissao necessaria', 'Precisamos acessar sua camera para tirar a foto do veiculo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7
      });
      if (!result.canceled) setFotoUri(result.assets[0].uri);
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel abrir a camera.');
    }
  };

  const enviarAlerta = async () => {
    if (!placa.trim()) { Alert.alert('Campo obrigatorio', 'Informe a placa.'); return; }
    if (!modelo.trim()) { Alert.alert('Campo obrigatorio', 'Informe o modelo.'); return; }
    if (!cor.trim()) { Alert.alert('Campo obrigatorio', 'Informe a cor.'); return; }

    setEnviando(true);
    try {
      const resVeiculo = await fetch(API + '/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: placa.toUpperCase().trim(),
          model: modelo.trim(),
          color: cor.trim(),
          recompensa: recompensa ? parseFloat(recompensa) : null,
          tipo: tipo
        })
      });

      const textoVeiculo = await resVeiculo.text();

      if (resVeiculo.status === 409) {
        Alert.alert('Alerta ja existe', JSON.parse(textoVeiculo).message);
        setEnviando(false);
        return;
      }

      if (!resVeiculo.ok) {
        Alert.alert('Erro servidor', 'Status ' + resVeiculo.status + '\n' + textoVeiculo);
        setEnviando(false);
        return;
      }

      const veiculo = JSON.parse(textoVeiculo);

      const resAlerta = await fetch(API + '/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: veiculo.id,
          ownerId: usuarioId,
          lat: localizacao.lat,
          lng: localizacao.lng
        })
      });

      if (!resAlerta.ok) {
        Alert.alert('Erro ao criar alerta', await resAlerta.text());
        setEnviando(false);
        return;
      }

      const alertaCriado = await resAlerta.json();
      setModalCadastro(false);
      setPlaca(''); setModelo(''); setCor('');
      setRecompensa(''); setTipo('carro');

      // Se nao precisa pagar caucao, ativa o alerta direto
      if (!alertaCriado.precisaPagar) {
        setMeuAlertaId(alertaCriado.alertId);
        AsyncStorage.setItem('meuAlertaId', alertaCriado.alertId);
        AsyncStorage.setItem('alertaCriadoEm', new Date().toISOString());
        Alert.alert('Alerta enviado!', 'As pessoas proximas foram notificadas.\nVoce sera avisado quando seu veiculo for avistado!', [{ text: 'OK' }]);
        buscarAlertas(localizacao.lat, localizacao.lng);
      } else {
        // Tem recompensa — exibe modal do PIX para pagar o caucao
        setModalPix({
          alertId: alertaCriado.alertId,
          valorCaucao: alertaCriado.valorCaucao,
          recompensa: alertaCriado.recompensa,
          qr_code: alertaCriado.qr_code,
          qr_code_base64: alertaCriado.qr_code_base64,
          paymentId: alertaCriado.paymentId
        });
        iniciarPollingPagamento(alertaCriado.alertId);
      }

    } catch (e) {
      Alert.alert('Erro de conexao', e.message);
    }
    setEnviando(false);
  };

  // Fica verificando a cada 5s se o pagamento foi confirmado
  const iniciarPollingPagamento = (alertId) => {
    setAguardandoPagamento(true);
    if (pollingPagamentoRef.current) clearInterval(pollingPagamentoRef.current);
    pollingPagamentoRef.current = setInterval(async () => {
      try {
        const res = await fetch(API + '/api/alerts/' + alertId + '/status-pagamento');
        const data = await res.json();
        if (data.pago) {
          clearInterval(pollingPagamentoRef.current);
          setAguardandoPagamento(false);
          setModalPix(null);
          setMeuAlertaId(alertId);
          AsyncStorage.setItem('meuAlertaId', alertId);
          AsyncStorage.setItem('alertaCriadoEm', new Date().toISOString());
          Alert.alert('Pagamento confirmado!', 'Seu alerta esta ativo!\nAs pessoas proximas ja foram notificadas.', [{ text: 'OK' }]);
          buscarAlertas(localizacao.lat, localizacao.lng);
        }
      } catch (e) {
        console.log('Erro polling pagamento:', e.message);
      }
    }, 5000);
  };

  // Faz upload da foto para o Supabase Storage e retorna a URL pública
  const uploadFoto = async (uri) => {
    try {
      const nomeArquivo = 'avistamento_' + Date.now() + '.jpg';
      const response = await fetch(uri);
      const blob = await response.blob();
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/fotos-avistamentos/${nomeArquivo}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'image/jpeg',
          },
          body: blob
        }
      );
      if (!uploadRes.ok) {
        console.log('Erro upload foto:', await uploadRes.text());
        return null;
      }
      return `${SUPABASE_URL}/storage/v1/object/public/fotos-avistamentos/${nomeArquivo}`;
    } catch (e) {
      console.log('Erro ao fazer upload:', e.message);
      return null;
    }
  };

  const abrirModalTestemunha = (alerta) => {
    if (!alerta.recompensa) {
      confirmarAvistamentoSimples(alerta);
      return;
    }
    setModalTestemunha(alerta);
  };

  const confirmarAvistamentoSimples = async (alerta) => {
    if (!localizacao) return;
    try {
      await fetch(API + '/api/alerts/' + alerta.id + '/sighting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: localizacao.lat, lng: localizacao.lng, chavePix: null, fotoUrl: null })
      });
      Alert.alert('Obrigado!', 'O dono foi notificado.\nNao aborde o veiculo — acione o 190.');
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel registrar o avistamento.');
    }
  };

  const confirmarAvistamentoComPix = async () => {
    if (!chavePix.trim()) {
      Alert.alert('Campo obrigatorio', 'Informe sua chave PIX para receber a recompensa.');
      return;
    }
    if (!fotoUri) {
      Alert.alert('Foto obrigatoria', 'Tire uma foto do veiculo para comprovar o avistamento.');
      return;
    }
    if (!localizacao) return;

    setEnviando(true);
    try {
      // Faz upload da foto para o Supabase Storage
      const fotoUrl = await uploadFoto(fotoUri);

      await fetch(API + '/api/alerts/' + modalTestemunha.id + '/sighting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: localizacao.lat,
          lng: localizacao.lng,
          chavePix: chavePix.trim(),
          fotoUrl: fotoUrl
        })
      });

      setModalTestemunha(null);
      setChavePix('');
      setFotoUri(null);

      // Item 3 — mensagem clara para a testemunha sobre quando recebe
      Alert.alert(
        'Avistamento registrado!',
        'O dono foi notificado com sua localizacao e foto.\n\nSe ele confirmar que encontrou o veiculo, voce recebera R$ ' + modalTestemunha.recompensa + ' via PIX em ate 24 horas.\n\nNao aborde o veiculo — acione o 190.'
      );
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel registrar o avistamento.');
    }
    setEnviando(false);
  };

  const confirmarEncontrado = async () => {
    if (!modalConfirmar) return;
    try {
      await fetch(API + '/api/alerts/' + modalConfirmar.id + '/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailPagador: 'pagador@avisaai.com.br' })
      });

      setModalConfirmar(null);
      if (pollingRef.current) clearInterval(pollingRef.current);
      setMeuAlertaId(null);
      AsyncStorage.removeItem('meuAlertaId');
      AsyncStorage.removeItem('alertaCriadoEm');

      // Item 1 — mensagem simples, sem exibir PIX
      Alert.alert(
        'Que otimo!',
        'Fico feliz que encontrou seu veiculo!\n\nO pagamento da recompensa sera processado em ate 24 horas.',
        [{ text: 'OK' }]
      );
      buscarAlertas(localizacao.lat, localizacao.lng);
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel confirmar.');
    }
  };

  const enviarDecisao5dias = async (decisao) => {
    if (!numeroBo.trim()) {
      Alert.alert('Campo obrigatorio', 'Informe o numero do B.O. para continuar.');
      return;
    }
    try {
      const res = await fetch(API + '/api/alerts/' + meuAlertaId + '/decisao5dias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroBo: numeroBo.trim(), decisao })
      });
      const data = await res.json();
      if (data.success) {
        setModalDecisao5dias(false);
        setNumeroBo('');
        if (decisao === 'desistir') {
          setMeuAlertaId(null);
          AsyncStorage.removeItem('meuAlertaId');
          AsyncStorage.removeItem('alertaCriadoEm');
          if (pollingRef.current) clearInterval(pollingRef.current);
          Alert.alert('Solicitacao registrada!', 'Seu caucao sera devolvido em breve.');
          buscarAlertas(localizacao.lat, localizacao.lng);
        } else {
          Alert.alert('Buscas continuam!', 'B.O. registrado. Seu alerta continua ativo.');
        }
      }
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel registrar sua decisao.');
    }
  };

  const gpsTexto = localizacao
    ? 'GPS ativo — ' + localizacao.lat.toFixed(4) + ', ' + localizacao.lng.toFixed(4)
    : 'Aguardando GPS...';

  const iconeVeiculo = (t) => t === 'moto' ? '🏍' : '🚗';

  return (
    <View style={s.tela}>
      <StatusBar barStyle="light-content" backgroundColor="#12122A" />

      {/* Modal cadastro de usuário */}
      <Modal visible={modalUsuario} animationType="slide" transparent={false}>
        <ScrollView style={{ flex: 1, backgroundColor: '#F0F0EE' }}>
          <View style={{ backgroundColor: '#12122A', paddingTop: 60, paddingBottom: 32, paddingHorizontal: 24 }}>
            <View style={s.logoBadge}><Text style={s.logoLetra}>A</Text></View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFF', marginTop: 16 }}>Bem-vindo ao AvisaAI</Text>
            <Text style={{ fontSize: 14, color: '#8888AA', marginTop: 6 }}>Rede colaborativa contra roubo de veículos</Text>
          </View>

          <View style={{ padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#12122A', marginBottom: 6 }}>Crie sua conta</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 20 }}>
              Seus dados são usados apenas para identificar você no sistema e enviar notificações do seu veículo.
            </Text>

            <Text style={s.label}>Nome completo *</Text>
            <TextInput
              style={s.input}
              placeholder="Ex: João da Silva"
              placeholderTextColor="#AAA"
              value={nomeUsuario}
              onChangeText={setNomeUsuario}
              autoCapitalize="words"
            />

            <Text style={s.label}>CPF *</Text>
            <TextInput
              style={s.input}
              placeholder="000.000.000-00"
              placeholderTextColor="#AAA"
              value={cpfUsuario}
              onChangeText={(t) => setCpfUsuario(formatarCPF(t))}
              keyboardType="numeric"
              maxLength={14}
            />
            {cpfUsuario.length === 14 && (
              <Text style={{ fontSize: 12, marginTop: -10, marginBottom: 10, color: validarCPF(cpfUsuario) ? '#2E7D32' : '#C62828', fontWeight: '600' }}>
                {validarCPF(cpfUsuario) ? '✓ CPF válido' : '✗ CPF inválido'}
              </Text>
            )}

            <Text style={s.label}>Telefone com DDD *</Text>
            <TextInput
              style={s.input}
              placeholder="Ex: 11999999999"
              placeholderTextColor="#AAA"
              value={telefoneUsuario}
              onChangeText={setTelefoneUsuario}
              keyboardType="phone-pad"
              maxLength={15}
            />

            <TouchableOpacity
              style={[s.btnEnviar, salvandoUsuario && s.btnDesativado, { marginTop: 8 }]}
              onPress={salvarUsuario}
              disabled={salvandoUsuario}
            >
              {salvandoUsuario
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.btnEnviarTexto}>CRIAR MINHA CONTA</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>

      {/* Modal PIX — pagamento do caução */}
      <Modal visible={!!modalPix} animationType="slide" transparent={false}>
        <ScrollView style={{ flex: 1, backgroundColor: '#F0F0EE' }}>
          <View style={{ backgroundColor: '#12122A', paddingTop: 60, paddingBottom: 32, paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFF' }}>Pague o caução</Text>
            <Text style={{ fontSize: 14, color: '#8888AA', marginTop: 6 }}>Seu alerta sera ativado automaticamente apos a confirmacao</Text>
          </View>

          <View style={{ padding: 24 }}>
            <View style={{ backgroundColor: '#FFF9E6', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 13, color: '#B8860B', marginBottom: 4 }}>Valor do caução</Text>
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#B8860B' }}>R$ {modalPix?.valorCaucao}</Text>
              <Text style={{ fontSize: 12, color: '#888', marginTop: 8, textAlign: 'center' }}>
                Recompensa R$ {modalPix?.recompensa} + 1% de taxa{'\n'}Devolvido se nao encontrar o veiculo
              </Text>
            </View>

            <Text style={{ fontSize: 15, fontWeight: '700', color: '#12122A', marginBottom: 12 }}>
              Escaneie o QR Code com seu banco:
            </Text>

            {modalPix?.qr_code_base64 ? (
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Image
                  source={{ uri: 'data:image/png;base64,' + modalPix.qr_code_base64 }}
                  style={{ width: 220, height: 220, borderRadius: 12 }}
                />
              </View>
            ) : null}

            {modalPix?.qr_code ? (
              <View style={{ backgroundColor: '#F4F4F2', borderRadius: 12, padding: 14, marginBottom: 20 }}>
                <Text style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>PIX Copia e Cola:</Text>
                <Text style={{ fontSize: 11, color: '#333', lineHeight: 16 }} selectable>{modalPix.qr_code}</Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, padding: 14, marginBottom: 20 }}>
              {aguardandoPagamento && <ActivityIndicator color="#2E7D32" style={{ marginRight: 10 }} />}
              <Text style={{ fontSize: 13, color: '#2E7D32', flex: 1 }}>
                {aguardandoPagamento
                  ? 'Aguardando confirmacao do pagamento...'
                  : 'Verificando pagamento...'}
              </Text>
            </View>

            <TouchableOpacity
              style={{ padding: 16, alignItems: 'center' }}
              onPress={() => {
                if (pollingPagamentoRef.current) clearInterval(pollingPagamentoRef.current);
                setModalPix(null);
                setAguardandoPagamento(false);
              }}>
              <Text style={{ fontSize: 14, color: '#888' }}>Cancelar e voltar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>

      {/* Modal cadastro de veículo */}
      <Modal visible={modalCadastro} animationType="slide" transparent onRequestClose={() => setModalCadastro(false)}>
        <View style={s.modalFundo}>
          <ScrollView>
            <View style={s.modalBox}>
              <Text style={s.modalTitulo}>Dados do Veiculo</Text>
              <Text style={s.modalSub}>Preencha os dados para alertar as pessoas proximas</Text>

              <Text style={s.label}>Tipo de veiculo *</Text>
              <View style={s.tipoBox}>
                <TouchableOpacity style={[s.tipoBotao, tipo === 'carro' && s.tipoBotaoAtivo]} onPress={() => setTipo('carro')}>
                  <Text style={[s.tipoBotaoIcone, tipo === 'carro' && s.tipoBotaoIconeAtivo]}>🚗</Text>
                  <Text style={[s.tipoBotaoTexto, tipo === 'carro' && s.tipoBotaoTextoAtivo]}>Carro</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.tipoBotao, tipo === 'moto' && s.tipoBotaoAtivo]} onPress={() => setTipo('moto')}>
                  <Text style={[s.tipoBotaoIcone, tipo === 'moto' && s.tipoBotaoIconeAtivo]}>🏍</Text>
                  <Text style={[s.tipoBotaoTexto, tipo === 'moto' && s.tipoBotaoTextoAtivo]}>Moto</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Placa *</Text>
              <TextInput style={s.input} placeholder="Ex: ABC1234" placeholderTextColor="#AAA" value={placa} onChangeText={setPlaca} autoCapitalize="characters" maxLength={8} />

              <Text style={s.label}>Modelo *</Text>
              <TextInput style={s.input} placeholder="Ex: Honda Civic" placeholderTextColor="#AAA" value={modelo} onChangeText={setModelo} />

              <Text style={s.label}>Cor *</Text>
              <TextInput style={s.input} placeholder="Ex: Prata" placeholderTextColor="#AAA" value={cor} onChangeText={setCor} />

              <View style={s.divisor} />
              <Text style={s.secaoLabel}>Recompensa (opcional)</Text>
              <Text style={s.secaoSub}>
                Oferecer recompensa aumenta muito as chances de encontrar seu veiculo — pessoas se mobilizam mais quando ha um incentivo. Voce so paga se encontrar!
              </Text>

              <Text style={s.label}>Valor da recompensa (R$)</Text>
              <TextInput style={s.input} placeholder="Ex: 200" placeholderTextColor="#AAA" value={recompensa} onChangeText={setRecompensa} keyboardType="numeric" />

              <TouchableOpacity style={[s.btnEnviar, enviando && s.btnDesativado]} onPress={enviarAlerta} disabled={enviando}>
                {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnEnviarTexto}>ENVIAR ALERTA</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.btnCancelar} onPress={() => setModalCadastro(false)}>
                <Text style={s.btnCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal testemunha */}
      <Modal visible={!!modalTestemunha} animationType="slide" transparent onRequestClose={() => setModalTestemunha(null)}>
        <View style={s.modalFundo}>
          <ScrollView>
            <View style={s.modalBox}>
              <View style={s.recompensaIconeBox}>
                <Text style={s.recompensaIcone}>R$</Text>
              </View>
              <Text style={s.modalTitulo}>Recompensa disponivel!</Text>
              <Text style={s.modalSub}>O dono oferece recompensa para quem ajudar a encontrar este veiculo</Text>

              <View style={s.recompensaBox}>
                <Text style={s.recompensaValorLabel}>Voce pode receber</Text>
                <Text style={s.recompensaValor}>R$ {modalTestemunha?.recompensa}</Text>
              </View>

              <Text style={s.label}>Foto do veiculo * (obrigatoria)</Text>
              <TouchableOpacity style={s.fotoBox} onPress={tirarFoto}>
                {fotoUri ? (
                  <Image source={{ uri: fotoUri }} style={s.fotoPreview} />
                ) : (
                  <View style={s.fotoPlaceholder}>
                    <Text style={s.fotoPlaceholderIcone}>📷</Text>
                    <Text style={s.fotoPlaceholderTexto}>Toque para tirar foto</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={s.label}>Sua chave PIX para receber *</Text>
              <TextInput style={s.input} placeholder="CPF, email ou telefone" placeholderTextColor="#AAA" value={chavePix} onChangeText={setChavePix} autoCapitalize="none" />

              <Text style={s.pixInstrucao}>Voce so recebe se o dono confirmar que encontrou o veiculo com sua ajuda.</Text>

              <TouchableOpacity style={[s.btnEnviar, enviando && s.btnDesativado]} onPress={confirmarAvistamentoComPix} disabled={enviando}>
                {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnEnviarTexto}>VI O VEICULO AQUI!</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.btnCancelar} onPress={() => { setModalTestemunha(null); setChavePix(''); setFotoUri(null); }}>
                <Text style={s.btnCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal confirmar */}
      <Modal visible={!!modalConfirmar} animationType="slide" transparent onRequestClose={() => setModalConfirmar(null)}>
        <View style={s.modalFundo}>
          <View style={s.modalBox}>
            <Text style={s.modalTitulo}>Encontrou seu veiculo?</Text>
            <Text style={s.modalSub}>Se alguem te ajudou a encontrar, confirme para liberar a recompensa de R$ {modalConfirmar?.recompensa}</Text>
            <TouchableOpacity style={s.btnEnviar} onPress={confirmarEncontrado}>
              <Text style={s.btnEnviarTexto}>SIM, ENCONTREI!</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalConfirmar(null)}>
              <Text style={s.btnCancelarTexto}>Ainda nao encontrei</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal decisao 5 dias */}
      <Modal visible={modalDecisao5dias} animationType="slide" transparent onRequestClose={() => setModalDecisao5dias(false)}>
        <View style={s.modalFundo}>
          <View style={s.modalBox}>
            <Text style={s.modalTitulo}>Seu alerta completou 5 dias</Text>
            <Text style={s.modalSub}>Informe o numero do B.O. e escolha o que deseja fazer</Text>
            <Text style={s.label}>Numero do B.O. *</Text>
            <TextInput style={s.input} placeholder="Ex: 1234567/2026" placeholderTextColor="#AAA" value={numeroBo} onChangeText={setNumeroBo} />
            <TouchableOpacity style={[s.btnEnviar, { backgroundColor: '#2E7D32', marginBottom: 10 }]} onPress={() => enviarDecisao5dias('continuar')}>
              <Text style={s.btnEnviarTexto}>Seguir com as buscas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnEnviar, { backgroundColor: '#E85D24' }]} onPress={() => enviarDecisao5dias('desistir')}>
              <Text style={s.btnEnviarTexto}>Resgatar caucao e desistir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalDecisao5dias(false)}>
              <Text style={s.btnCancelarTexto}>Decidir depois</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal avistamento */}
      <Modal visible={!!modalAvistamento} animationType="slide" transparent onRequestClose={() => setModalAvistamento(null)}>
        <View style={s.modalFundo}>
          <View style={s.modalBox}>
            <View style={s.notificacaoIconeBox}>
              <Text style={s.notificacaoIcone}>📍</Text>
            </View>
            <Text style={s.modalTitulo}>Seu veiculo foi avistado!</Text>
            <Text style={s.modalSub}>Alguem viu seu veiculo e registrou a localizacao</Text>

            <View style={s.notificacaoInfoBox}>
              <Text style={s.notificacaoLabel}>Localizacao registrada</Text>
              <Text style={s.notificacaoCoords}>
                {modalAvistamento?.avistamento?.lat?.toFixed(4)}, {modalAvistamento?.avistamento?.lng?.toFixed(4)}
              </Text>
              <Text style={s.notificacaoHora}>
                {modalAvistamento?.avistamento?.created_at
                  ? new Date(modalAvistamento.avistamento.created_at).toLocaleTimeString('pt-BR')
                  : ''}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#4285F4', borderRadius: 12, padding: 12, alignItems: 'center' }}
                onPress={() => {
                  const lat = modalAvistamento?.avistamento?.lat;
                  const lng = modalAvistamento?.avistamento?.lng;
                  Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
                }}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Google Maps</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#00BFA5', borderRadius: 12, padding: 12, alignItems: 'center' }}
                onPress={() => {
                  const lat = modalAvistamento?.avistamento?.lat;
                  const lng = modalAvistamento?.avistamento?.lng;
                  Linking.openURL(`waze://?ll=${lat},${lng}&navigate=yes`);
                }}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Waze</Text>
              </TouchableOpacity>
            </View>

            {modalAvistamento?.avistamento?.foto_url && (
              <View style={s.fotoAvistamentoBox}>
                <Text style={s.label}>Foto tirada pela testemunha</Text>
                <Image source={{ uri: modalAvistamento.avistamento.foto_url }} style={s.fotoAvistamento} />
              </View>
            )}

            <TouchableOpacity style={s.btnEnviar} onPress={() => {
              setModalConfirmar({ id: modalAvistamento.alertId, recompensa: modalAvistamento?.avistamento?.recompensa });
              setModalAvistamento(null);
            }}>
              <Text style={s.btnEnviarTexto}>ENCONTREI MEU VEICULO!</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalAvistamento(null)}>
              <Text style={s.btnCancelarTexto}>Ainda nao encontrei</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.cabecalho}>
          <View style={s.cabecalhoTopo}>
            <TouchableOpacity onPress={handleLogoPress} activeOpacity={0.8}>
              <View style={s.logoBadge}><Text style={s.logoLetra}>A</Text></View>
            </TouchableOpacity>
            <View>
              <Text style={s.titulo}>AvisaAI</Text>
              <Text style={s.subtitulo}>Rede colaborativa contra roubo</Text>
            </View>
          </View>
          <View style={s.statusRede}>
            <View style={[s.statusPonto, { backgroundColor: localizacao ? '#4ADE80' : '#FFC107' }]} />
            <Text style={s.statusTexto}>
              {meuAlertaId ? 'Monitorando seu veiculo...' : gpsTexto}
            </Text>
          </View>
        </View>

        <View style={s.secaoBotao}>
          {!meuAlertaId ? (
            <TouchableOpacity style={s.btnPerdi} onPress={abrirCadastro} activeOpacity={0.85}>
              <View style={s.btnPerdiIconeBox}><Text style={s.btnPerdiIconeTexto}>!</Text></View>
              <Text style={s.btnPerdiTexto}>ME AJUDA</Text>
              <Text style={s.btnPerdiSub}>Toque para alertar pessoas proximas</Text>
            </TouchableOpacity>
          ) : modalAvistamento ? (
            <TouchableOpacity style={[s.btnPerdi, { backgroundColor: '#E85D24' }]} onPress={() => setModalAvistamento(modalAvistamento)} activeOpacity={0.85}>
              <View style={s.btnPerdiIconeBox}><Text style={s.btnPerdiIconeTexto}>📍</Text></View>
              <Text style={s.btnPerdiTexto}>VEICULO AVISTADO!</Text>
              <Text style={s.btnPerdiSub}>Toque para ver a localizacao</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.btnPerdi, { backgroundColor: '#2E7D32' }]} onPress={() => verificarAvistamentos(meuAlertaId)} activeOpacity={0.85}>
              <View style={s.btnPerdiIconeBox}><Text style={s.btnPerdiIconeTexto}>🔍</Text></View>
              <Text style={s.btnPerdiTexto}>MONITORANDO...</Text>
              <Text style={s.btnPerdiSub}>Aguardando avistamentos do seu veiculo</Text>
            </TouchableOpacity>
          )}
        </View>

        {meuAlertaId && (
          <View style={s.monitorandoBox}>
            <Text style={s.monitorandoTexto}>Monitorando seu veiculo — verificando avistamentos a cada 30s</Text>
          </View>
        )}

        <View style={s.contadorBox}>
          <View style={s.contadorItem}>
            <Text style={s.contadorNumero}>{alertas.length}</Text>
            <Text style={s.contadorLabel}>Alertas ativos</Text>
          </View>
          <View style={s.contadorDivisor} />
          <View style={s.contadorItem}>
            <Text style={s.contadorNumero}>5km</Text>
            <Text style={s.contadorLabel}>Raio monitorado</Text>
          </View>
          <View style={s.contadorDivisor} />
          <View style={s.contadorItem}>
            <Text style={s.contadorNumero}>24h</Text>
            <Text style={s.contadorLabel}>Monitoramento</Text>
          </View>
        </View>

        <View style={s.secao}>
          <View style={s.secaoTituloBox}>
            <Text style={s.secaoTitulo}>Alertas proximos a voce</Text>
            <TouchableOpacity onPress={() => localizacao && buscarAlertas(localizacao.lat, localizacao.lng)}>
              <Text style={s.atualizar}>Atualizar</Text>
            </TouchableOpacity>
          </View>

          {carregando && <ActivityIndicator color="#E85D24" size="large" style={{ marginTop: 30 }} />}

          {alertas.length === 0 && !carregando && (
            <View style={s.vazio}>
              <View style={s.vazioIconeBox}><Text style={s.vazioIcone}>OK</Text></View>
              <Text style={s.vazioTitulo}>Nenhum alerta na sua regiao</Text>
              <Text style={s.vazioSub}>Voce sera notificado se houver algum veiculo roubado proximo</Text>
            </View>
          )}

          {alertas.map((alerta) => (
            <TouchableOpacity key={alerta.id} style={s.card} onPress={() => abrirModalTestemunha(alerta)} activeOpacity={0.75}>
              <View style={s.cardIconeBox}>
                <Text style={s.cardIconeTipo}>{iconeVeiculo(alerta.tipo)}</Text>
              </View>
              <View style={s.cardCentro}>
                <Text style={s.placa}>{alerta.plate}</Text>
                <Text style={s.cardDesc}>{alerta.color} - {alerta.model}</Text>
                <Text style={s.cardTipo}>{alerta.tipo === 'moto' ? 'Motocicleta' : 'Automovel'}</Text>
                {alerta.recompensa && (
                  <View style={s.recompensaBadge}>
                    <Text style={s.recompensaBadgeTexto}>Recompensa: R$ {alerta.recompensa}</Text>
                  </View>
                )}
                <Text style={s.cardAcao}>Toque se voce viu este veiculo</Text>
              </View>
              <View style={s.cardBadgeBox}><Text style={s.cardBadge}>ATIVO</Text></View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.aviso}>
          <View style={s.avisoIconeBox}><Text style={s.avisoIcone}>i</Text></View>
          <Text style={s.avisoTexto}>Nunca aborde o veiculo sozinho. Apenas reporte a localizacao e acione a policia pelo 190.</Text>
        </View>

        <View style={s.rodape}>
          <Text style={s.rodapeTexto}>AvisaAI - Juntos somos mais fortes</Text>
        </View>
      </ScrollView>

      {/* Modal senha admin */}
      <Modal visible={modalSenhaAdmin} animationType="fade" transparent onRequestClose={() => setModalSenhaAdmin(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 20, padding: 28, width: '100%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#12122A', marginBottom: 4 }}>Acesso restrito</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Digite a senha para acessar o painel administrativo</Text>
            <TextInput
              style={s.input}
              placeholder="Senha"
              placeholderTextColor="#AAA"
              value={senhaAdmin}
              onChangeText={setSenhaAdmin}
              secureTextEntry
              autoFocus
            />
            <TouchableOpacity style={s.btnEnviar} onPress={entrarAdmin}>
              <Text style={s.btnEnviarTexto}>ENTRAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalSenhaAdmin(false)}>
              <Text style={s.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal painel admin */}
      <Modal visible={modalAdmin} animationType="slide" transparent={false} onRequestClose={() => setModalAdmin(false)}>
        <View style={{ flex: 1, backgroundColor: '#12122A' }}>
          <View style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF' }}>Painel Admin</Text>
              <Text style={{ fontSize: 12, color: '#8888AA', marginTop: 2 }}>{statsAdmin?.geradoEm || 'Carregando...'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={carregarStatsAdmin} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>↻ Atualizar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalAdmin(false)} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>✕ Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {carregandoAdmin ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color="#E85D24" size="large" />
              <Text style={{ color: '#888', marginTop: 12 }}>Carregando dados...</Text>
            </View>
          ) : statsAdmin ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>

              {/* Cards de numeros */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: '#1E3A5F', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: '#64B5F6' }}>{statsAdmin.usuarios}</Text>
                  <Text style={{ fontSize: 13, color: '#90CAF9', marginTop: 4 }}>Usuarios cadastrados</Text>
                </View>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: '#1B3A1B', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: '#81C784' }}>{statsAdmin.alertas.ativos}</Text>
                  <Text style={{ fontSize: 13, color: '#A5D6A7', marginTop: 4 }}>Alertas ativos agora</Text>
                </View>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: '#3E2723', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: '#FFCC80' }}>{statsAdmin.avistamentos}</Text>
                  <Text style={{ fontSize: 13, color: '#FFE0B2', marginTop: 4 }}>Avistamentos totais</Text>
                </View>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: '#1A237E', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: '#9FA8DA' }}>{statsAdmin.alertas.encontrados}</Text>
                  <Text style={{ fontSize: 13, color: '#C5CAE9', marginTop: 4 }}>Veiculos encontrados</Text>
                </View>
              </View>

              {/* Alertas detalhados */}
              <View style={{ backgroundColor: '#1A1A2E', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF', marginBottom: 12 }}>Alertas por status</Text>
                {[
                  { label: 'Ativos', valor: statsAdmin.alertas.ativos, cor: '#4CAF50' },
                  { label: 'Encontrados', valor: statsAdmin.alertas.encontrados, cor: '#2196F3' },
                  { label: 'Cancelados', valor: statsAdmin.alertas.cancelados, cor: '#F44336' },
                  { label: 'Aguard. pagto', valor: statsAdmin.alertas.pendentes, cor: '#FF9800' },
                  { label: 'Total', valor: statsAdmin.alertas.total, cor: '#FFF' },
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ fontSize: 14, color: '#AAA' }}>{item.label}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: item.cor }}>{item.valor}</Text>
                  </View>
                ))}
              </View>

              {/* Financeiro */}
              <View style={{ backgroundColor: '#1A1A2E', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF', marginBottom: 12 }}>Financeiro</Text>
                {[
                  { label: 'Total em caucao (ativo)', valor: formatarMoeda(statsAdmin.recompensas.em_caucao), cor: '#FF9800' },
                  { label: 'Recompensas pagas', valor: formatarMoeda(statsAdmin.recompensas.recompensas_pagas), cor: '#4CAF50' },
                  { label: 'Total movimentado', valor: formatarMoeda(statsAdmin.recompensas.total_cadastrado), cor: '#64B5F6' },
                  { label: 'Receita AvisaAI (1%)', valor: formatarMoeda(statsAdmin.receita.taxa_total), cor: '#E85D24' },
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ fontSize: 14, color: '#AAA' }}>{item.label}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: item.cor }}>{item.valor}</Text>
                  </View>
                ))}
              </View>

              {/* Ultimos alertas */}
              <View style={{ backgroundColor: '#1A1A2E', borderRadius: 16, padding: 16, marginBottom: 32 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF', marginBottom: 12 }}>Ultimos 10 alertas</Text>
                {statsAdmin.ultimosAlertas.map((alerta, i) => (
                  <View key={i} style={{ paddingVertical: 10, borderBottomWidth: i < statsAdmin.ultimosAlertas.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF', letterSpacing: 1 }}>{alerta.plate}</Text>
                      <View style={{ backgroundColor: statusCor(alerta.status) + '33', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: statusCor(alerta.status) }}>{statusLabel(alerta.status)}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 13, color: '#888' }}>{alerta.color} {alerta.model} • {alerta.owner_name}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>{alerta.total_avistamentos} avistamento(s)</Text>
                      {alerta.recompensa && <Text style={{ fontSize: 12, color: '#FFCC80' }}>R$ {alerta.recompensa}</Text>}
                      <Text style={{ fontSize: 12, color: '#555' }}>{new Date(alerta.created_at).toLocaleDateString('pt-BR')}</Text>
                    </View>
                  </View>
                ))}
              </View>

            </ScrollView>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Nenhum dado disponivel</Text>
            </View>
          )}
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#F0F0EE' },
  scroll: { flex: 1 },
  cabecalho: { backgroundColor: '#12122A', paddingTop: 50, paddingBottom: 24, paddingHorizontal: 20 },
  cabecalhoTopo: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  logoBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E85D24', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  logoLetra: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  titulo: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  subtitulo: { fontSize: 12, color: '#8888AA', marginTop: 1 },
  statusRede: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  statusPonto: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusTexto: { fontSize: 12, color: '#AAAACC' },
  secaoBotao: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  btnPerdi: { backgroundColor: '#E85D24', borderRadius: 20, padding: 28, alignItems: 'center', elevation: 10 },
  btnPerdiIconeBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btnPerdiIconeTexto: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  btnPerdiTexto: { fontSize: 22, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  btnPerdiSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  monitorandoBox: { marginHorizontal: 16, marginBottom: 4, backgroundColor: '#E8F5E9', borderRadius: 12, padding: 10, borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  monitorandoTexto: { fontSize: 12, color: '#2E7D32', textAlign: 'center' },
  contadorBox: { flexDirection: 'row', backgroundColor: '#FFF', margin: 16, borderRadius: 16, padding: 16, elevation: 2 },
  contadorItem: { flex: 1, alignItems: 'center' },
  contadorNumero: { fontSize: 22, fontWeight: '800', color: '#12122A' },
  contadorLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center' },
  contadorDivisor: { width: 1, backgroundColor: '#EEE', marginVertical: 4 },
  secao: { paddingHorizontal: 16, paddingBottom: 8 },
  secaoTituloBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  secaoTitulo: { fontSize: 16, fontWeight: '700', color: '#12122A' },
  atualizar: { fontSize: 13, color: '#E85D24', fontWeight: '600' },
  vazio: { backgroundColor: '#FFF', borderRadius: 16, padding: 32, alignItems: 'center' },
  vazioIconeBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  vazioIcone: { fontSize: 20, fontWeight: '800', color: '#4CAF50' },
  vazioTitulo: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 6 },
  vazioSub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 3, borderLeftWidth: 4, borderLeftColor: '#E85D24' },
  cardIconeBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardIconeTipo: { fontSize: 22 },
  cardCentro: { flex: 1 },
  placa: { fontSize: 19, fontWeight: '800', color: '#12122A', letterSpacing: 1 },
  cardDesc: { fontSize: 13, color: '#666', marginTop: 3 },
  cardTipo: { fontSize: 11, color: '#888', marginTop: 2 },
  cardAcao: { fontSize: 12, color: '#E85D24', marginTop: 6, fontWeight: '500' },
  cardBadgeBox: { backgroundColor: '#FFF0EB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardBadge: { fontSize: 10, fontWeight: '700', color: '#E85D24' },
  recompensaBadge: { backgroundColor: '#FFF9E6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start' },
  recompensaBadgeTexto: { fontSize: 11, fontWeight: '700', color: '#B8860B' },
  aviso: { flexDirection: 'row', margin: 16, backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14, alignItems: 'flex-start', borderLeftWidth: 3, borderLeftColor: '#FFC107' },
  avisoIconeBox: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 },
  avisoIcone: { fontSize: 13, fontWeight: '900', color: '#FFF' },
  avisoTexto: { flex: 1, fontSize: 12, color: '#7A5C00', lineHeight: 18 },
  rodape: { alignItems: 'center', paddingVertical: 24 },
  rodapeTexto: { fontSize: 12, color: '#AAA' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: '#12122A', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#888', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: { backgroundColor: '#F4F4F2', borderRadius: 12, padding: 14, fontSize: 15, color: '#12122A', marginBottom: 14, borderWidth: 1, borderColor: '#E8E8E8' },
  divisor: { height: 1, backgroundColor: '#EEE', marginVertical: 16 },
  secaoLabel: { fontSize: 15, fontWeight: '700', color: '#12122A', marginBottom: 4 },
  secaoSub: { fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 18 },
  btnEnviar: { backgroundColor: '#E85D24', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 4 },
  btnDesativado: { opacity: 0.6 },
  btnEnviarTexto: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
  btnCancelar: { padding: 16, alignItems: 'center', marginTop: 4 },
  btnCancelarTexto: { fontSize: 15, color: '#888' },
  tipoBox: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tipoBotao: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#F4F4F2', borderWidth: 1, borderColor: '#E8E8E8' },
  tipoBotaoAtivo: { backgroundColor: '#FFF0EB', borderColor: '#E85D24' },
  tipoBotaoIcone: { fontSize: 24, marginBottom: 4 },
  tipoBotaoIconeAtivo: { color: '#E85D24' },
  tipoBotaoTexto: { fontSize: 14, fontWeight: '600', color: '#888' },
  tipoBotaoTextoAtivo: { color: '#E85D24' },
  fotoBox: { borderRadius: 12, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: '#E8E8E8' },
  fotoPreview: { width: '100%', height: 180 },
  fotoPlaceholder: { height: 120, backgroundColor: '#F4F4F2', alignItems: 'center', justifyContent: 'center' },
  fotoPlaceholderIcone: { fontSize: 32, marginBottom: 6 },
  fotoPlaceholderTexto: { fontSize: 13, color: '#888' },
  recompensaIconeBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF9E6', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  recompensaIcone: { fontSize: 20, fontWeight: '900', color: '#B8860B' },
  recompensaBox: { backgroundColor: '#FFF9E6', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  recompensaValorLabel: { fontSize: 12, color: '#B8860B', marginBottom: 4 },
  recompensaValor: { fontSize: 32, fontWeight: '900', color: '#B8860B' },
  pixInstrucao: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 16, textAlign: 'center' },
  notificacaoIconeBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  notificacaoIcone: { fontSize: 32 },
  notificacaoInfoBox: { backgroundColor: '#F4F4F2', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  notificacaoLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  notificacaoCoords: { fontSize: 16, fontWeight: '700', color: '#12122A', marginBottom: 4 },
  notificacaoHora: { fontSize: 12, color: '#888' },
  fotoAvistamentoBox: { marginBottom: 16 },
  fotoAvistamento: { width: '100%', height: 180, borderRadius: 12 }
});
