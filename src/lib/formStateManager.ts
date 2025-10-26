// Form state persistence for Add/Edit Lead forms
interface FormState {
  [formId: string]: Record<string, any>;
}

const FORM_STATE_KEY = 'crm_form_state';

class FormStateManager {
  private state: FormState = {};

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      const stored = sessionStorage.getItem(FORM_STATE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load form state:', error);
    }
  }

  private saveState(): void {
    try {
      sessionStorage.setItem(FORM_STATE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to save form state:', error);
    }
  }

  saveFormState(formId: string, data: Record<string, any>): void {
    this.state[formId] = data;
    this.saveState();
  }

  getFormState(formId: string): Record<string, any> | null {
    return this.state[formId] || null;
  }

  clearFormState(formId: string): void {
    delete this.state[formId];
    this.saveState();
  }

  clearAllForms(): void {
    sessionStorage.removeItem(FORM_STATE_KEY);
    this.state = {};
  }
}

export const formStateManager = new FormStateManager();
