import axios from 'axios';
import { cleanPhoneNumber } from './phone';
import { getAllSettings } from './settings-sync';

async function getEvolutionConfig() {
  const settings = await getAllSettings();
  
  return {
    baseUrl: (settings.evolutionUrl || process.env.EVOLUTION_API_URL || 'https://evolution-api-yweq.onrender.com').replace(/\/$/, ''),
    apiKey: settings.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'Innovary@2026#WhatsAppAPI',
    instance: settings.evolutionInstance || process.env.EVOLUTION_INSTANCE_NAME || 'SPE'
  };
}


import { logEvent } from './logger';

export async function sendWhatsAppText(toPhone: string, text: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { baseUrl, apiKey, instance } = await getEvolutionConfig();
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

    const isSuccess = response.status >= 200 && response.status < 300 && (!response.data?.status || response.data.status !== 'ERROR');
    
    logEvent({
      eventType: 'EVOLUTION_SEND',
      contactPhone: phone,
      details: {
        type: 'text',
        success: isSuccess,
        status: response.status,
        textLength: text.length
      }
    });

    return { success: isSuccess, data: response.data };
  } catch (error: any) {
    const errMsg = error?.response?.data?.message || error.message || 'Erro desconhecido ao enviar mensagem';
    logEvent({
      eventType: 'EVOLUTION_SEND',
      contactPhone: toPhone,
      details: { type: 'text', success: false, error: errMsg }
    });
    console.error('Erro ao enviar mensagem no WhatsApp via Evolution API:', error?.response?.data || error.message);
    return {
      success: false,
      error: errMsg
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
    const { baseUrl, apiKey, instance } = await getEvolutionConfig();
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

    const isSuccess = response.status >= 200 && response.status < 300 && (!response.data?.status || response.data.status !== 'ERROR');

    logEvent({
      eventType: 'EVOLUTION_SEND',
      contactPhone: phone,
      details: {
        type: 'media',
        fileName,
        mediaUrl,
        success: isSuccess,
        status: response.status
      }
    });

    return { success: isSuccess, data: response.data };
  } catch (error: any) {
    const errMsg = error?.response?.data?.message || error.message || 'Erro ao enviar documento';
    logEvent({
      eventType: 'EVOLUTION_SEND',
      contactPhone: toPhone,
      details: { type: 'media', fileName, success: false, error: errMsg }
    });
    console.error('Erro ao enviar documento no WhatsApp via Evolution API:', error?.response?.data || error.message);
    return {
      success: false,
      error: errMsg
    };
  }
}

export async function checkEvolutionConnection(): Promise<{ connected: boolean; state: string; details?: any }> {
  try {
    const { baseUrl, apiKey, instance } = await getEvolutionConfig();
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
    const { baseUrl, apiKey, instance } = await getEvolutionConfig();
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
    const { baseUrl, apiKey, instance } = await getEvolutionConfig();
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

