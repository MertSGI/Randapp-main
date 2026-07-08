import React, { createContext, useContext, useState, ReactNode } from 'react';
import ConfirmModal from '../components/ConfirmModal';

interface DialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isAlert?: boolean;
}

interface DialogContextProps {
  confirm: (options: DialogOptions) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
}

const DialogContext = createContext<DialogContextProps | undefined>(undefined);

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = (opts: DialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions({ ...opts, isAlert: false });
      setResolver(() => resolve);
      setIsOpen(true);
    });
  };

  const alert = (message: string, title?: string): Promise<void> => {
    return new Promise((resolve) => {
      setOptions({ message, title, isAlert: true });
      setResolver(() => resolve);
      setIsOpen(true);
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolver) resolver(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolver) resolver(false);
  };

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {options && (
        <ConfirmModal
          isOpen={isOpen}
          title={options.title || (options.isAlert ? 'Bilgi' : 'Onay')}
          message={options.message}
          confirmText={options.confirmText || 'Tamam'}
          cancelText={options.isAlert ? undefined : (options.cancelText || 'İptal')}
          onConfirm={handleConfirm}
          onCancel={options.isAlert ? handleConfirm : handleCancel}
        />
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialog must be used within DialogProvider');
  return context;
};
