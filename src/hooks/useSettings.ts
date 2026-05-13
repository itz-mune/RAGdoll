import { useState, useEffect } from 'react';
import {
  getSelectedProvider,
  setSelectedProvider,
  setApiKey,
  hasValidSetup,
  type Provider,
} from '../lib/store';

const SIDECAR_URL = 'http://127.0.0.1:8765';

interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export function useSettings() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [validationLoading, setValidationLoading] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const savedProvider = await getSelectedProvider();
        const validSetup = await hasValidSetup();

        setProvider(savedProvider);
        setHasKey(validSetup);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  const validateAndSaveSettings = async (
    newProvider: Provider,
    apiKey: string,
    model?: string
  ): Promise<ValidationResult> => {
    setValidationLoading(true);
    try {
      const response = await fetch(`${SIDECAR_URL}/settings/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: newProvider, api_key: apiKey, model }),
      });

      const result = (await response.json()) as ValidationResult;

      if (result.valid) {
        await setSelectedProvider(newProvider);
        await setApiKey(newProvider, apiKey);
        setProvider(newProvider);
        setHasKey(true);
      }

      return result;
    } catch (error) {
      console.error('Validation error:', error);
      return {
        valid: false,
        error: 'Failed to validate API key. Check your connection and try again.',
      };
    } finally {
      setValidationLoading(false);
    }
  };

  const clearSettings = async (): Promise<void> => {
    try {
      await setProvider(null);
      setHasKey(false);
      // Could also call clearAllSettings() from store, but we'll just clear state
      // and let user reconfigure
    } catch (error) {
      console.error('Failed to clear settings:', error);
    }
  };

  return {
    provider,
    hasKey,
    isLoading,
    validationLoading,
    validateAndSaveSettings,
    clearSettings,
  };
}
