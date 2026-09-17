import axios from 'axios';
import { cleanPhoneNumber } from './phone';
import { getDb } from './db';

function getEvolutionConfig() {
  const db = getDb();
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  
  const urlRow = getSetting.get('evolutionUrl') as { value: string } | undefined;
  const keyRow = getSetting.get('evolutionApiKey') as { value: string } | undefined;
  const instRow = getSetting.get('evolutionInstance') as { value: string } | undefined;

  return {
    baseUrl: (urlRow?.value || process.env.EVOLUTION_API_URL || 'https://evolution-api-yweq.onrender.com').replace(/\/$/, ''),
    apiKey: keyRow?.value || process.env.EVOLUTION_API_KEY || 'Innovary@2026#WhatsAppAPI',
    instance: instRow?.value || process.env.EVOLUTION_INSTANCE_NAME || 'SPE'
  };
}

export async function sendWhatsAppText(toPhone: string, text: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { baseUrl, apiKey, instance } = getEvolutionConfig();
    const phone = cleanPhoneNumber(toPhone);

    const endpoint = `${baseUrl}/message/sendText/${instance}`;
    const response = await axios.post(
      endpoint,
      {
        number: phone,
        text: text,
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: true
        }
      },
      {
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return { success: true, data: response.data };
  } catch (error: any) {
    console.error('Erro ao enviar mensagem no WhatsApp via Evolution API:', error?.response?.data || error.message);
    return {
      success: false,
      error: error?.response?.data?.message || error.message || 'Erro desconhecido ao enviar mensagem'
    };
  }
}

export async function sendWhatsAppMedia(
  toPhone: string,
  mediaUrl: string,
  fileName: string,
  caption?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { baseUrl, apiKey, instance } = getEvolutionConfig();
    const phone = cleanPhoneNumber(toPhone);

    const endpoint = `${baseUrl}/message/sendMedia/${instance}`;
    const response = await axios.post(
      endpoint,
      {
        number: phone,
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption: caption || '',
        media: mediaUrl,
        fileName: fileName
      },
      {
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return { success: true, data: response.data };
  } catch (error: any) {
    console.error('Erro ao enviar documento no WhatsApp via Evolution API:', error?.response?.data || error.message);
    return {
      success: false,
      error: error?.response?.data?.message || error.message || 'Erro ao enviar documento'
    };
  }
}

export async function checkEvolutionConnection(): Promise<{ connected: boolean; state: string; details?: any }> {
  try {
    const { baseUrl, apiKey, instance } = getEvolutionConfig();
    const endpoint = `${baseUrl}/instance/connectionState/${instance}`;
    
    const response = await axios.get(endpoint, {
      headers: {
        'apikey': apiKey
      },
      timeout: 10000
    });

    const state = response.data?.instance?.state || response.data?.state || 'unknown';
    const isConnected = state === 'open';

    return {
      connected: isConnected,
      state: state,
      details: response.data
    };
  } catch (error: any) {
    return {
      connected: false,
      state: 'error',
      details: error?.response?.data || error.message
    };
  }
}

export async function fetchWhatsAppContacts(): Promise<any[]> {
  try {
    const { baseUrl, apiKey, instance } = getEvolutionConfig();
    const endpoint = `${baseUrl}/chat/findContacts/${instance}`;
    const response = await axios.post(endpoint, {}, {
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error: any) {
    console.error('Erro ao buscar contatos na Evolution API:', error?.response?.data || error.message);
    return [];
  }
}

export async function fetchWhatsAppChats(): Promise<any[]> {
  try {
    const { baseUrl, apiKey, instance } = getEvolutionConfig();
    const endpoint = `${baseUrl}/chat/findChats/${instance}`;
    const response = await axios.post(endpoint, {}, {
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error: any) {
    console.error('Erro ao buscar conversas na Evolution API:', error?.response?.data || error.message);
    return [];
  }
}

