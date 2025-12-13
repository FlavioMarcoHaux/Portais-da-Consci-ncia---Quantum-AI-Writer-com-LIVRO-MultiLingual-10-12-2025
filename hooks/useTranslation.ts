
import { Language } from '../types';
import { TRANSLATIONS } from '../translations';

export const useTranslation = (language: Language) => {
  return TRANSLATIONS[language] || TRANSLATIONS['pt'];
};
