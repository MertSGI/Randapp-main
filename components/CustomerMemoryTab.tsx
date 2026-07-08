import React, { useState, useEffect, useRef } from 'react';
import { CustomerProfile, Appointment, Staff, Service, CustomerMemoryNote, CustomerMemoryPhoto, CustomerCampaignReward } from '../types';
import { adminCustomerService } from '../services/adminCustomerService';
import { consentService } from '../services/consentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { entitlementService } from '../services/entitlementService';

interface CustomerMemoryTabProps {
  appointments: Appointment[];
  staffList: Staff[];
  servicesList: Service[];
  targetAppointmentId?: string | null;
  onClearTarget?: () => void;
}

const CustomerMemoryTab: React.FC<CustomerMemoryTabProps> = ({ appointments, staffList, servicesList, targetAppointmentId, onClearTarget }) => {
  const { t, language } = useLanguage();
  const { tenant } = useTenant();
  const { confirm: showConfirm, alert: showAlert } = useDialog();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [customerRewards, setCustomerRewards] = useState<CustomerCampaignReward[]>([]);
  const [referralActivity, setReferralActivity] = useState<{
    invitedOthers: any[];
    wasInvitedBy: any | null;
  }>({ invitedOthers: [], wasInvitedBy: null });

  // Note form
  const [newNote, setNewNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preference form
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [prefForm, setPrefForm] = useState({
    stylePreference: '',
    colorFormula: '',
    avoidNotes: '',
    careNotes: ''
  });

  const planId = tenant?.planId || 'baslangic';
  const hasAccess = entitlementService.canUseFeature(planId, 'customer_memory_lite') || entitlementService.canUseFeature(planId, 'customer_memory_full');

  useEffect(() => {
    if (!hasAccess) return;
    const loadCustomers = async () => {
      if (tenant) {
        const loaded = await adminCustomerService.getCustomers(tenant.id, appointments);
        setCustomers(loaded);
  
        // Handle deep link from appointment
        if (targetAppointmentId && onClearTarget) {
          const matchingCustomer = loaded.find(c => c.appointmentIds?.includes(targetAppointmentId));
          if (matchingCustomer) {
            handleSelectCustomer(matchingCustomer);
          }
          onClearTarget();
        }
      }
    };
    loadCustomers();
  }, [tenant, appointments, targetAppointmentId, onClearTarget, hasAccess]);

  useEffect(() => {
    if (tenant && selectedCustomer) {
      import('../services/customerCampaignService').then(({ customerCampaignService }) => {
        customerCampaignService.listCustomerReferrals(tenant.id).then(allRefs => {
          const invitedOthers = allRefs.filter(r => r.referrerCustomerId === selectedCustomer.id || r.referrerCustomerId === 'referred_by_' + selectedCustomer.fullName);
          const wasInvitedBy = allRefs.find(r => r.referredCustomerName === selectedCustomer.fullName || (selectedCustomer.phone && r.referredCustomerPhone === selectedCustomer.phone)) || null;
          setReferralActivity({ invitedOthers, wasInvitedBy });
        }).catch(err => {
          console.warn("Could not retrieve customer referral activity for memory card:", err);
        });

        // Load active customer rewards from reward ledger
        customerCampaignService.listCustomerRewardsByCustomer(tenant.id, selectedCustomer.id).then(rewList => {
          setCustomerRewards(rewList);
        }).catch(err => {
          console.warn("Could not retrieve customer rewards from ledger:", err);
          setCustomerRewards([]);
        });
      });
    } else {
      setCustomerRewards([]);
    }
  }, [tenant, selectedCustomer]);

  const handleSelectCustomer = (customer: CustomerProfile) => {
    setSelectedCustomer(customer);
    setPrefForm({
      stylePreference: customer.stylePreference || '',
      colorFormula: customer.colorFormula || '',
      avoidNotes: customer.avoidNotes || '',
      careNotes: customer.careNotes || ''
    });
    setEditingPrefs(false);
  };

  const handleSavePrefs = async () => {
    if (!tenant || !selectedCustomer) return;
    const updated = await adminCustomerService.updateCustomer(tenant.id, selectedCustomer.id, prefForm);
    if (updated) {
      setSelectedCustomer(updated);
      setEditingPrefs(false);
      
      const loaded = await adminCustomerService.getCustomers(tenant.id, appointments);
      setCustomers(loaded);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !selectedCustomer || !newNote.trim()) return;
    
    await adminCustomerService.addNote(tenant.id, selectedCustomer.id, newNote);
    setNewNote('');
    
    const loaded = await adminCustomerService.getCustomers(tenant.id, appointments);
    setCustomers(loaded);
    const updatedCust = loaded.find(c => c.id === selectedCustomer.id);
    if(updatedCust) setSelectedCustomer(updatedCust);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!tenant || !selectedCustomer) return;
    const confirmed = await showConfirm({ message: (t.admin as any).confirm_delete_note || 'Notu silmek istediğinize emin misiniz?' });
    if (!confirmed) return;
    
    await adminCustomerService.deleteNote(tenant.id, selectedCustomer.id, noteId);
    
    const loaded = await adminCustomerService.getCustomers(tenant.id, appointments);
    setCustomers([...loaded]);
    const updatedCust = loaded.find(c => c.id === selectedCustomer.id);
    if(updatedCust) {
      setSelectedCustomer({...updatedCust});
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant || !selectedCustomer) return;
    
    if (!entitlementService.canUseFeature(planId, 'customer_memory_full')) {
       alert(language === 'tr' ? 'Fotoğraf yükleme özelliği Full CRM paketlerinde mevcuttur.' : 'Photo upload is available in Full CRM plans.');
       return;
    }

    // File size guard (3MB)
    if (file.size > 3 * 1024 * 1024) {
      alert(language === 'tr' ? 'Dosya boyutu 3MB\'dan küçük olmalıdır.' : 'File size must be less than 3MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await adminCustomerService.addPhoto(tenant.id, selectedCustomer.id, base64);
      
      const loaded = await adminCustomerService.getCustomers(tenant.id, appointments);
      setCustomers(loaded);
      const updatedCust = loaded.find(c => c.id === selectedCustomer.id);
      if(updatedCust) setSelectedCustomer(updatedCust);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!tenant || !selectedCustomer) return;
    const confirmed = await showConfirm({ message: 'Fotoğrafı silmek istediğinize emin misiniz?' });
    if (!confirmed) return;

    await adminCustomerService.deletePhoto(tenant.id, selectedCustomer.id, photoId);
    
    const loaded = await adminCustomerService.getCustomers(tenant.id, appointments);
    setCustomers([...loaded]);
    const updatedCust = loaded.find(c => c.id === selectedCustomer.id);
    if(updatedCust) {
      setSelectedCustomer({...updatedCust});
    }
  };

  if (!hasAccess) {
    return (
      <div className="space-y-8">
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {language === 'tr' ? 'Bu özellik mevcut paketinizde yer almıyor' : 'Feature not included in your current plan'}
          </h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {language === 'tr' 
              ? 'Müşteri Hafızası ve CRM özellikleri Standart ve üstü paketlerde kullanılabilir.'
              : 'Customer memory and CRM are available in the Standard plan and above.'}
          </p>
          <a href="#/admin/billing" className="bg-accent hover:bg-blue-600 text-white font-bold py-2.5 px-6 rounded-md shadow transition inline-block">
            {language === 'tr' ? 'Paketleri İncele' : 'View Plans'}
          </a>
        </div>
      </div>
    );
  }

  if (!selectedCustomer) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-slate-800/80 border-b border-gray-200 dark:border-slate-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t.admin.customers_title}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.admin.customers_subtitle}</p>
          </div>
          <ul className="divide-y divide-gray-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
            {customers.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                <div className="w-16 h-16 bg-gray-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-4 border border-gray-100 dark:border-slate-600">
                  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Kayıtlı Müşteri Yok</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">{t.admin.no_customer_history}</p>
                <button onClick={() => window.open('/#/book?preview=true', '_blank')} className="px-5 py-2 bg-white text-gray-700 border border-gray-300 dark:bg-slate-700 dark:text-gray-200 dark:border-slate-600 rounded-lg shadow-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-sm">Site Önizlemesini Aç</button>
              </div>
            ) : (
              customers.map(customer => {
                const staff = staffList.find(s => s.id === customer.preferredStaffId);
                const service = servicesList.find(s => s.id === customer.lastServiceId);
                
                return (
                  <li 
                    key={customer.id} 
                    className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-300"
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-accent dark:text-blue-400 truncate">{customer.fullName}</p>
                        <p className="text-sm text-gray-500">
                          {customer.phone || customer.email}
                        </p>
                        <div className="mt-1 flex items-center text-xs text-gray-400 gap-2">
                          <span>{t.admin.last_visit}: {customer.lastAppointmentAt || '-'}</span>
                          <span>•</span>
                          <span>{t.admin.total_appointments}: {customer.totalAppointments || 1}</span>
                          {staff && (
                            <>
                              <span>•</span>
                              <span>{t.admin.preferred_staff}: {staff.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <button className="text-accent hover:text-blue-700 text-sm font-medium">
                          {t.admin.view_profile}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    );
  }

  // Details View
  const customerApps = appointments.filter(a => selectedCustomer.appointmentIds?.includes(a.id)).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const limitMemory = tenant && selectedCustomer ? !consentService.canUseCustomerMemory(tenant.id, selectedCustomer.id) : false;
  const consentFlags = tenant && selectedCustomer ? consentService.getCustomerConsent(tenant.id, selectedCustomer.id) : null;

  return (
    <div className="space-y-6">
      <button 
        onClick={() => setSelectedCustomer(null)}
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center"
      >
        &larr; {t.admin.back_to_customers}
      </button>

      <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex justify-between items-start mb-6 border-b border-gray-200 dark:border-slate-700 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
               {selectedCustomer.fullName}
               <span className="text-xs bg-accent text-white px-2 py-1 rounded-full font-normal hidden sm:inline-block">
                 {t.admin.total_appointments}: {selectedCustomer.totalAppointments}
               </span>
               {consentFlags ? (
                 <span className="text-xs border border-green-200 bg-green-50 text-green-700 px-2 py-1 rounded font-medium ml-2">İzinler: Aktif</span>
               ) : (
                 <span className="text-xs border border-gray-200 bg-gray-50 text-gray-500 px-2 py-1 rounded font-medium ml-2">İzin Bekleniyor</span>
               )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedCustomer.phone} • {selectedCustomer.email}</p>
          </div>
          <div className="text-right text-sm text-gray-500 dark:text-gray-400 object-right">
            <p className="mb-1"><span className="text-gray-400 text-xs uppercase mr-1">{t.admin.first_visit}:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{selectedCustomer.firstVisitAt || '-'}</span></p>
            <p><span className="text-gray-400 text-xs uppercase mr-1">{t.admin.last_visit}:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{selectedCustomer.lastAppointmentAt || '-'}</span></p>
          </div>
        </div>

        {/* Top metrics block for quick info answers */}
        {!limitMemory && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
             <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/50">
               <p className="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold mb-1">{t.admin.last_service}</p>
               <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                 {servicesList.find(s => s.id === selectedCustomer.lastServiceId)?.name_tr || servicesList.find(s => s.id === selectedCustomer.lastServiceId)?.name || t.admin.unknown_service}
               </p>
             </div>
             <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800/50">
               <p className="text-xs text-purple-600 dark:text-purple-400 uppercase font-semibold mb-1">{t.admin.preferred_staff}</p>
               <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                 {staffList.find(s => s.id === selectedCustomer.preferredStaffId)?.name || t.admin.unknown_staff}
               </p>
             </div>
             <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800/50">
               <p className="text-xs text-green-600 dark:text-green-400 uppercase font-semibold mb-1">{t.admin.hair_style_pref}</p>
               <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={selectedCustomer.stylePreference || '-'}>
                 {selectedCustomer.stylePreference || '-'}
               </p>
             </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* LEFT COLUMN: Preferences & Notes */}
          {limitMemory ? (
          <div className="bg-orange-50 dark:bg-orange-900/20 border justify-center border-orange-200 dark:border-orange-800 p-6 rounded-lg text-center mb-6 h-fit">
             <h3 className="text-orange-800 dark:text-orange-400 font-medium mb-2">Sınırlı Müşteri Hafızası</h3>
             <p className="text-sm text-orange-700 dark:text-orange-300">Bu müşteri için ayrıntılı müşteri hafızası izni (veri işleme) bulunmuyor. Yalnızca geçmiş randevu listesine erişebilirsiniz.</p>
          </div>
          ) : (
          <div className="space-y-8">
            {/* Style Preferences */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t.admin.style_preferences}</h3>
                {!editingPrefs && (
                  <button onClick={() => setEditingPrefs(true)} className="text-sm text-accent hover:underline">{t.admin.edit}</button>
                )}
              </div>
              
              {editingPrefs ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">{t.admin.hair_style_pref}</label>
                    <input type="text" value={prefForm.stylePreference} onChange={e => setPrefForm({...prefForm, stylePreference: e.target.value})} className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 bg-transparent dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">{t.admin.color_formula_pref}</label>
                    <input type="text" value={prefForm.colorFormula} onChange={e => setPrefForm({...prefForm, colorFormula: e.target.value})} className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 bg-transparent dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">{t.admin.avoid_dislike_notes}</label>
                    <input type="text" value={prefForm.avoidNotes} onChange={e => setPrefForm({...prefForm, avoidNotes: e.target.value})} className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 bg-transparent dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">{t.admin.special_care_notes}</label>
                    <input type="text" value={prefForm.careNotes} onChange={e => setPrefForm({...prefForm, careNotes: e.target.value})} className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 bg-transparent dark:text-white" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSavePrefs} className="px-3 py-1 bg-accent text-white rounded text-sm hover:bg-blue-600">{t.admin.save}</button>
                    <button onClick={() => setEditingPrefs(false)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">{t.admin.cancel_btn}</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-gray-50 dark:bg-slate-700/50 p-4 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">{t.admin.hair_style_pref}</p>
                    <p className="text-sm font-medium dark:text-white">{selectedCustomer.stylePreference || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">{t.admin.color_formula_pref}</p>
                    <p className="text-sm font-medium dark:text-white">{selectedCustomer.colorFormula || '-'}</p>
                  </div>
                  <div>
                     <p className="text-xs text-gray-500 uppercase">{t.admin.avoid_dislike_notes}</p>
                     <p className="text-sm font-medium dark:text-white text-red-500">{selectedCustomer.avoidNotes || '-'}</p>
                  </div>
                  <div>
                     <p className="text-xs text-gray-500 uppercase">{t.admin.special_care_notes}</p>
                     <p className="text-sm font-medium dark:text-white">{selectedCustomer.careNotes || '-'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Internal Notes */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.admin.internal_notes}</h3>
              <div className="space-y-3 mb-4">
                {(!selectedCustomer.internalNotes || selectedCustomer.internalNotes.length === 0) ? (
                  <p className="text-sm text-gray-500">{t.admin.no_notes_yet}</p>
                ) : (
                  selectedCustomer.internalNotes.map(note => (
                    <div key={note.id} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 p-3 rounded-lg relative group">
                      <p className="text-sm text-gray-800 dark:text-gray-200">{note.text}</p>
                      <div className="mt-2 flex justify-between items-center">
                        <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleDateString()} by {note.createdBy}</span>
                        <button onClick={() => handleDeleteNote(note.id)} className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">{t.admin.delete}</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input 
                  type="text" 
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder={t.admin.add_quick_note}
                  className="flex-1 border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-transparent dark:text-white"
                />
                <button type="submit" className="px-3 py-1 bg-accent text-white rounded-md text-sm whitespace-nowrap hover:bg-blue-600">
                  {t.admin.add_note}
                </button>
              </form>
            </div>
            
            {/* Reference Photos */}
             <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t.admin.reference_photos}</h3>
                <div>
                   <input 
                     type="file" 
                     accept="image/*" 
                     className="hidden" 
                     ref={fileInputRef}
                     onChange={handleFileUpload}
                   />
                   <button onClick={() => fileInputRef.current?.click()} className="text-sm text-accent hover:underline">
                     + {t.admin.upload}
                   </button>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {selectedCustomer.referencePhotos?.map(photo => (
                  <div key={photo.id} className="relative group rounded-md overflow-hidden aspect-square border border-gray-200 dark:border-slate-700">
                    <img src={photo.url} alt="Reference" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">{t.admin.reference_photos_notice}</p>
            </div>

            {/* Referral & Campaign Activity */}
            <div className="border-t border-gray-200 dark:border-slate-700 pt-6 mt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {language === 'tr' ? 'Referans ve Kampanyalar' : 'Referrals & Campaigns'}
              </h3>
              
              <div className="space-y-4">
                {/* Invited By */}
                {referralActivity.wasInvitedBy ? (
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-900/30 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-indigo-500 uppercase font-semibold">{language === 'tr' ? 'Yönlendiren Kişi' : 'Referred By'}</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">
                        {referralActivity.wasInvitedBy.referrerCustomerId.startsWith('referred_by_') 
                         ? referralActivity.wasInvitedBy.referrerCustomerId.replace('referred_by_', '') 
                         : referralActivity.wasInvitedBy.referrerCustomerId}
                      </p>
                    </div>
                    <span className="text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 px-2.5 py-1 rounded">
                      {referralActivity.wasInvitedBy.campaignId === 'default' ? 'Arkadaşını Getir v1' : referralActivity.wasInvitedBy.campaignId}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    {language === 'tr' ? 'Bu müşteri herhangi bir referans kaydıyla gelmedi.' : 'This customer was not registered via referral code.'}
                  </p>
                )}

                {/* Invited Others */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {language === 'tr' ? `Davet Ettiği Arkadaşlar (${referralActivity.invitedOthers.length})` : `Invited Friends (${referralActivity.invitedOthers.length})`}
                  </h4>
                  {referralActivity.invitedOthers.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      {language === 'tr' ? 'Henüz kimseyi davet etmedi.' : 'Has not invited anyone yet.'}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {referralActivity.invitedOthers.map(ref => (
                        <div key={ref.id} className="bg-gray-50 dark:bg-slate-750/30 p-3 rounded-lg border border-gray-200 dark:border-slate-700 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-gray-800 dark:text-gray-200">{ref.referredCustomerName}</p>
                            {ref.referredCustomerPhone && <p className="text-gray-400">{ref.referredCustomerPhone}</p>}
                          </div>
                          <div className="text-right">
                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                              ref.status === 'completed' ? 'bg-teal-100 text-teal-800' :
                              ref.status === 'rewarded' ? 'bg-green-100 text-green-800' :
                              ref.status === 'booked' ? 'bg-indigo-100 text-indigo-800' :
                              ref.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {ref.status}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-1">{new Date(ref.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Earned Rewards from Ledger */}
                <div className="border-t border-gray-100 dark:border-slate-700/60 pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {language === 'tr' ? 'Hak Edilen Kampanya Ödülleri' : 'Earned Campaign Rewards'}
                  </h4>
                  {customerRewards.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      {language === 'tr' ? 'Henüz hak kazanılmış bir ödülü bulunmuyor.' : 'Has not earned any campaign rewards yet.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {customerRewards.map(rw => (
                        <div key={rw.id} className="bg-purple-50/50 dark:bg-purple-950/10 p-3 rounded-lg border border-purple-100/40 dark:border-purple-800/20 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-gray-800 dark:text-gray-200">{rw.rewardDescription}</p>
                            <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                              {rw.rewardOwnerType === 'referrer_customer' ? (language === 'tr' ? 'Davet Eden Ödülü' : 'Referrer Reward') : (language === 'tr' ? 'Yeni Üye Ödülü' : 'Referee Friend Reward')}
                            </p>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                              rw.status === 'available' ? 'bg-purple-105 text-purple-700 bg-purple-50 dark:bg-purple-900/20' :
                              rw.status === 'used' ? 'bg-green-105 text-green-700 bg-green-50 dark:bg-green-900/20' :
                              rw.status === 'cancelled' ? 'bg-red-105 text-red-700 bg-red-50 dark:bg-red-900/20' :
                              'bg-gray-105 text-gray-700 bg-gray-50'
                            }`}>
                              {rw.status === 'available' ? (language === 'tr' ? 'Aktif' : 'Active') :
                               rw.status === 'used' ? (language === 'tr' ? 'Kullanıldı' : 'Used') :
                               rw.status === 'cancelled' ? (language === 'tr' ? 'İptal' : 'Cancelled') : rw.status}
                            </span>
                            <p className="text-[9px] text-gray-400 mt-1">{new Date(rw.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* RIGHT COLUMN: Appointment History */}
          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-4 border border-gray-100 dark:border-slate-700 h-fit">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.admin.appointment_history}</h3>
            <div className="space-y-4">
              {customerApps.length === 0 ? (
                <p className="text-sm text-gray-500">{t.admin.no_appointments_found}</p>
              ) : (
                customerApps.map(apt => {
                  const staff = staffList.find(s => s.id === apt.staffId);
                  const service = servicesList.find(s => s.id === apt.serviceId);
                  const serviceName = language === 'tr' ? (service?.name_tr || service?.name) : service?.name;
                  return (
                    <div key={apt.id} className="bg-white dark:bg-slate-800 p-3 rounded-md shadow-sm border border-gray-100 dark:border-slate-600">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium dark:text-white">{apt.date} {apt.time}</p>
                          <p className="text-xs text-gray-500">{serviceName || t.admin.unknown_service} - {staff?.name || t.admin.unknown_staff}</p>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                          apt.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          apt.status.includes('cancel') ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {t.customer_portal?.[`status_${apt.status}`] || t.admin[apt.status] || apt.status}
                        </span>
                      </div>
                      {apt.status.includes('cancel') && apt.cancelReason && (
                        <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-1.5 rounded">
                           <span className="font-semibold">{language === 'tr' ? 'İptal Nedeni:' : 'Cancel Reason:'}</span> {apt.cancelReason}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Data Governance / Customer Data Requests */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-700">
           <h3 className="text-sm font-medium text-gray-500 uppercase flex items-center gap-2 mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {language === 'tr' ? 'Veri Portabilitesi ve Hak Talepleri (KVKK/GDPR)' : 'Data Portability & Rights Requests (GDPR)'}
           </h3>
           <div className="flex gap-4 items-center">
              <button disabled className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 py-2 px-4 rounded-lg font-medium border border-slate-200 dark:border-slate-700" title="Veri güvenliği ve yasal uyum için canlı veritabanı yapılandırması bekleniyor">
                 {language === 'tr' ? 'Müşteri Kaydını Dışa Aktar (CSV)' : 'Export Customer Record (CSV)'}
              </button>
              <button disabled className="text-xs bg-red-50 dark:bg-red-900/10 text-red-400 py-2 px-4 rounded-lg font-medium" title="Veri güvenliği ve yasal uyum için canlı veritabanı yapılandırması bekleniyor">
                 {language === 'tr' ? 'Unutulma Hakkı (Veriyi Anonimleştir)' : 'Right to be Forgotten (Anonymize Data)'}
              </button>
              <span className="text-[10px] text-gray-400 italic">
                 {language === 'tr' ? '* Güvenlik protokolü devrededir.' : '* Security lock active.'}
              </span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerMemoryTab;
