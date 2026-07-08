import React, { useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface ImageUploadProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, label, className = '' }) => {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const t = {
    en: {
      select: 'Select Photo',
      change: 'Change',
      remove: 'Remove',
      drag: 'or drag and drop',
      formats: 'JPG, PNG, WebP',
      label: 'Photo'
    },
    tr: {
      select: 'Fotoğraf Seç',
      change: 'Değiştir',
      remove: 'Kaldır',
      drag: 'veya sürükleyip bırakın',
      formats: 'JPG, PNG, WebP',
      label: 'Fotoğraf'
    }
  }[language];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Create an object URL for preview purposes. 
    // In a real app this would upload to storage and return the URL.
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onChange(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onChange(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-300">
          {label}
        </label>
      )}
      
      {value ? (
        <div className="relative group rounded-md overflow-hidden border border-gray-200 dark:border-slate-700 h-32">
          <img src={value} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
             <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-gray-100"
             >
                {t.change}
             </button>
             <button 
                type="button"
                onClick={() => onChange('')}
                className="bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-red-600"
             >
                {t.remove}
             </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
      ) : (
        <div 
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${isDragging ? 'border-accent bg-blue-50 dark:bg-blue-900/10' : 'border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-400 bg-gray-50 dark:bg-slate-700'}`}
        >
          <svg className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
             <span className="text-accent">{t.select}</span> {t.drag}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{t.formats}</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
      )}
    </div>
  );
};
