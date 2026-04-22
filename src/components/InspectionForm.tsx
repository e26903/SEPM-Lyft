import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  ChevronRight, 
  ChevronLeft, 
  Camera, 
  CheckCircle2, 
  Save, 
  Download, 
  Mail, 
  Info,
  Zap,
  Droplet,
  Settings,
  ShieldCheck,
  ClipboardCheck,
  History,
  Trash2,
  Plus
} from 'lucide-react';
import { cn } from '../lib/utils';
import { InspectionData, Condition } from '../types';
import { saveInspection, getDestinationUrl, getDropboxToken } from '../lib/storage';
import { generateInspectionPDF } from '../lib/pdf';
import { SITES, Site } from '../data/sites';
import { Search as SearchIcon } from 'lucide-react';
import { getImportedSites } from '../lib/storage';
import { format } from 'date-fns';

// Logic for multi-step form
const STEPS = [
  { id: 'general', title: 'Location', icon: Info },
  { id: 'electrical', title: 'Electrical', icon: Zap },
  { id: 'pumps', title: 'Pumps', icon: Droplet },
  { id: 'wetwell', title: 'Wet Well', icon: ClipboardCheck },
  { id: 'controls', title: 'Controls', icon: Settings },
  { id: 'service', title: 'Service', icon: History },
  { id: 'review', title: 'Review', icon: ShieldCheck }
];

interface FormProps {
  inspection: InspectionData;
  setInspection: (data: InspectionData) => void;
  onBack: () => void;
  onComplete: () => void;
  key?: string;
}

export function InspectionForm({ inspection, setInspection, onBack, onComplete }: FormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStepId = STEPS[stepIndex].id;
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  
  const isReadOnly = inspection.status === 'submitted';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [stepIndex]);

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<InspectionData>({
    defaultValues: inspection
  });

  const formValues = watch();

  const handleNext = async () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      saveInspection(formValues);
    } else {
      setSubmitting(true);
      setStatusMsg('Finalizing report...');
      
      try {
        const rawDest = await getDestinationUrl();
        const dbxToken = await getDropboxToken();
        
        // Sanitize destination path - if it's a URL, ignore it and use root or extract simple folder
        let cleanDest = '';
        if (rawDest && !rawDest.startsWith('http')) {
          cleanDest = rawDest.startsWith('/') ? rawDest : `/${rawDest}`;
          if (cleanDest.endsWith('/')) cleanDest = cleanDest.slice(0, -1);
        }

        // 1. Finalize the data
        const finalData = { ...formValues, status: 'submitted' as const, submittedAt: new Date().toISOString() };
        await saveInspection(finalData);

        // 2. Generate PDF
        const doc = await generateInspectionPDF(finalData);
        const fileName = `SEPM_Inspection_Report_${finalData.workOrderNo || 'Draft'}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;

        if (dbxToken) {
          setStatusMsg('Uploading directly to Dropbox...');
          // Get base64 string from doc
          const pdfData = doc.output('arraybuffer');
          const base64String = btoa(
            new Uint8Array(pdfData)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          // Call our server API
          const response = await fetch('/api/upload-to-dropbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pdfBase64: base64String,
              fileName: cleanDest ? `${cleanDest}/${fileName}` : fileName,
              accessToken: dbxToken
            })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || error.error || 'Upload failed');
          }
          
          setStatusMsg('Report Synchronized!');
        } else {
          setStatusMsg('Downloading report...');
          // Fallback to manual download
          doc.save(fileName);
          
          if (rawDest && rawDest.startsWith('http')) {
            setStatusMsg('Opening destination...');
            setTimeout(() => {
              window.open(rawDest, '_blank');
            }, 1000);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        setSubmitting(false);
        onComplete();
      } catch (err: any) {
        console.error("Submission error:", err);
        alert(`Submission Error: ${err.message}`);
        setSubmitting(false);
        setStatusMsg(null);
      }
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const renderCurrentStep = () => {
    switch (currentStepId) {
      case 'general': return <GeneralInfoStep register={register} setValue={setValue} watch={watch} disabled={isReadOnly} />;
      case 'electrical': return <ElectricalStep register={register} disabled={isReadOnly} />;
      case 'pumps': return <PumpsStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} />;
      case 'wetwell': return <WetWellStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} />;
      case 'controls': return <ControlsStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} />;
      case 'service': return <ServiceStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} />;
      case 'review': return <ReviewStep values={formValues} register={register} disabled={isReadOnly} />;
      default: return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <header className="p-6 md:p-8 pb-4 flex items-center justify-between gap-4 border-b border-slate-50">
        <button onClick={onBack} className="p-2.5 md:p-3 bg-slate-50 border border-slate-100 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl font-black text-sepm-dark uppercase tracking-tight">{STEPS[stepIndex].title}</h2>
            {isReadOnly && (
              <span className="bg-red-500/10 text-red-500 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-red-500/20">Locked</span>
            )}
          </div>
          <div className="flex gap-1 mt-2">
            {STEPS.map((step, idx) => (
              <div 
                key={step.id} 
                className={cn(
                  "h-1.5 rounded-full flex-1 transition-all",
                  idx === stepIndex ? "bg-sepm-cyan" : idx < stepIndex ? "bg-sepm-cyan/30" : "bg-slate-100"
                )}
              />
            ))}
          </div>
        </div>
        {!isReadOnly && (
          <button 
            onClick={() => saveInspection(formValues)}
            className="p-3 bg-slate-50 border border-slate-100 hover:border-sepm-cyan text-sepm-cyan rounded-2xl transition-all"
          >
            <Save size={20} />
          </button>
        )}
      </header>

      {/* Step Content */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-6 md:px-8 py-4 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepId}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            {renderCurrentStep()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Footer */}
      <footer className="p-6 md:p-8 pt-4 bg-white/80 backdrop-blur-md border-t border-slate-100 absolute bottom-0 w-full flex gap-3 md:gap-4">
        {stepIndex > 0 && (
          <button 
            onClick={handlePrev}
            className="flex-1 py-3.5 md:py-5 bg-slate-50 border border-slate-100 hover:bg-slate-100 font-black rounded-2xl flex items-center justify-center gap-2 transition-all text-xs uppercase tracking-widest text-slate-400"
          >
            <ChevronLeft size={18} /> Back
          </button>
        )}
        <button 
          onClick={handleNext}
          disabled={submitting}
          className={cn(
            "flex-[2] py-3.5 md:py-5 font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-sepm-cyan/20 text-xs uppercase tracking-widest",
            stepIndex === STEPS.length - 1 ? (isReadOnly ? "bg-slate-800 text-white" : "bg-sepm-dark text-white") : "bg-sepm-cyan text-white",
            submitting && "opacity-50 cursor-wait"
          )}
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {statusMsg || 'Transmitting...'}
            </div>
          ) : (
            <>
              {stepIndex === STEPS.length - 1 ? (isReadOnly ? 'Finish Review' : 'Commit Report') : 'Next Step'}
              <ChevronRight size={18} />
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

// --- Internal Step Components ---

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] pl-1">{title}</h3>
      <div className="bg-slate-50/50 border border-slate-100 rounded-3xl md:rounded-[40px] p-6 md:p-10 space-y-6 md:space-y-8">
        {children}
      </div>
    </div>
  );
}

function Input({ label, disabled, ...props }: any) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60 grayscale-[0.2]")}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input 
        disabled={disabled}
        className="white-input w-full rounded-xl md:rounded-2xl px-5 py-4 text-sm font-bold placeholder:text-slate-300 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
}

function Select({ label, options, disabled, ...props }: any) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60 grayscale-[0.2]")}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <div className="relative">
        <select 
          disabled={disabled}
          className="white-input w-full rounded-xl md:rounded-2xl px-5 py-4 text-sm font-bold appearance-none disabled:cursor-not-allowed"
          {...props}
        >
          {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
          <ChevronRight size={18} className="rotate-90" />
        </div>
      </div>
    </div>
  );
}

function MultiImageUpload({ label, images, onAdd, onRemove, disabled }: { label: string; images: string[]; onAdd: (img: string) => void; onRemove: (index: number) => void; disabled?: boolean }) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const files = e.target.files;
    if (!files) return;
    
    for (const file of Array.from(files) as File[]) {
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(file);
      const img = await promise;
      onAdd(img);
    }
    // Clear input
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {images.map((img, i) => (
          <div key={i} className="relative aspect-video rounded-2xl overflow-hidden group border border-slate-100 shadow-sm bg-white">
            <img src={img} alt="detail" className="w-full h-full object-cover" />
            {!disabled && (
              <button 
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 active:scale-90"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <label className="aspect-video bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300 cursor-pointer hover:border-sepm-cyan hover:text-sepm-cyan hover:bg-sepm-cyan/5 transition-all group overflow-hidden">
            <Camera size={28} className="mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-[9px] font-black uppercase tracking-widest text-center px-4">Attach Media</span>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function GeneralInfoStep({ register, setValue, watch, disabled }: any) {
  const [storeSearch, setStoreSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [allSites, setAllSites] = useState<Site[]>(SITES);

  React.useEffect(() => {
    getImportedSites().then(imported => {
      if (imported && imported.length > 0) {
        // Merge without duplicates (using storeNo as key)
        const combined = [...imported];
        const existingNos = new Set(imported.map(s => s.storeNo));
        
        SITES.forEach(s => {
          if (!existingNos.has(s.storeNo)) {
            combined.push(s);
          }
        });
        
        setAllSites(combined);
      }
    });
  }, []);
  
  // Fuzzy search and filter
  const filteredSites = React.useMemo(() => {
    if (!storeSearch || disabled) return [];
    const search = storeSearch.toLowerCase();
    return allSites.filter(s => 
      s.storeNo.toLowerCase().includes(search) ||
      s.city.toLowerCase().includes(search) ||
      s.streetAddress1.toLowerCase().includes(search) ||
      (s as any).name?.toLowerCase().includes(search)
    ).slice(0, 50); 
  }, [storeSearch, allSites, disabled]);

  const handleSelectSite = (site: Site) => {
    if (disabled) return;
    setValue('storeNo', site.storeNo);
    setValue('streetAddress1', site.streetAddress1);
    setValue('city', site.city);
    setValue('state', site.state);
    setValue('zipcode', site.zipcode);
    setStoreSearch(site.storeNo);
    setShowDropdown(false);
  };

  return (
    <>
      <FieldGroup title="Search & Station Selection">
        <div className="relative space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Station Search</label>
          <div className="relative">
            <input 
              disabled={disabled}
              className="white-input w-full rounded-2xl px-5 py-4 text-sm font-black pr-12 disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder={disabled ? "Station Locked" : "Store ID / City / Street..."}
              value={storeSearch}
              onChange={(e) => {
                setStoreSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => !disabled && setShowDropdown(true)}
            />
            <SearchIcon className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          </div>
          
          <AnimatePresence>
            {showDropdown && storeSearch.length > 0 && !disabled && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-2xl max-h-[300px] overflow-y-auto"
              >
                {filteredSites.length > 0 ? filteredSites.map(s => (
                  <button
                    key={s.storeNo}
                    type="button"
                    onClick={() => handleSelectSite(s)}
                    className="w-full text-left p-5 hover:bg-sepm-cyan group transition-colors border-b border-slate-50 last:border-b-0"
                  >
                    <div className="font-black text-sm text-slate-900 group-hover:text-white">Store #{s.storeNo}</div>
                    <div className="text-[10px] text-slate-400 group-hover:text-white/80 font-bold uppercase tracking-tight">{s.streetAddress1}, {s.city}</div>
                  </button>
                )) : (
                  <div className="p-8 text-xs text-slate-400 font-bold uppercase italic text-center">No matching stations found</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Hidden register for storeNo */}
          <input type="hidden" {...register('storeNo')} />
        </div>
      </FieldGroup>

      <FieldGroup title="Inspection Header">
        <Input label="Work Order #" {...register('workOrderNo')} placeholder="WO-XXXX-XXXX" disabled={disabled} />
        <Input label="Technician Name" {...register('technicianName')} placeholder="Enter full name..." disabled={disabled} />
        <Input label="Arrival Date & Time" type="datetime-local" {...register('arrivalDateTime')} disabled={disabled} />
      </FieldGroup>
      
      <FieldGroup title="Verified Location">
        <div className={cn("bg-sepm-cyan/5 border border-sepm-cyan/10 p-5 rounded-2xl space-y-4", disabled && "opacity-60")}>
          <div className="flex items-center gap-3 text-sepm-cyan">
             <div className="p-2 bg-sepm-cyan/10 rounded-xl"><Info size={16} /></div>
             <span className="text-[10px] font-black uppercase tracking-[0.2em]">Validated Address</span>
          </div>
          <div className="space-y-4">
            <div className="text-sm font-black text-sepm-dark">{watch('streetAddress1') || 'No location selected'}</div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-tight">
              {watch('city') && `${watch('city')}, ${watch('state')} ${watch('zipcode')}`}
            </div>
          </div>
        </div>
      </FieldGroup>

      <FieldGroup title="Classification">
        <Select 
          disabled={disabled}
          label="Property Classification" 
          options={[' - - - - - ', 'Walmart Div 1', "Sam's Club", 'Supercenter', 'Neighborhood Mkt', 'Dark Store', 'Supply Chain', 'Other']} 
          {...register('propertyClassification')} 
        />
        {watch('propertyClassification') === 'Other' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Input label="Other Details" {...register('propertyClassificationOtherDetails')} placeholder="Enter classification details..." disabled={disabled} />
          </motion.div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Inspection Type" options={[' - - - - - ', 'PREVENTATIVE', 'EMERGENCY']} {...register('inspectionType')} disabled={disabled} />
          <Select label="Lift Station Type" options={[' - - - - - ', 'Primary', 'Secondary']} {...register('liftStationType')} disabled={disabled} />
        </div>
        <Select label="Station Status" options={[' - - - - - ', 'NORMAL', 'ALARM']} {...register('alarmStatus')} disabled={disabled} />
      </FieldGroup>
    </>
  );
}

function PumpSection({ id, title, register, disabled }: { id: string; title: string; register: any; disabled?: boolean }) {
  return (
    <FieldGroup title={title}>
      <div className="space-y-4">
        <div className="text-[10px] font-black text-sepm-cyan border-b border-sepm-cyan/10 pb-2 uppercase tracking-widest italic flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sepm-cyan" /> Line Voltage (OFF)
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="L1" {...register(`${id}.volts_off.l1`)} placeholder="V" disabled={disabled} />
          <Input label="L2" {...register(`${id}.volts_off.l2`)} placeholder="V" disabled={disabled} />
          <Input label="L3" {...register(`${id}.volts_off.l3`)} placeholder="V" disabled={disabled} />
        </div>
        <div className="text-[10px] font-black text-sepm-cyan border-b border-sepm-cyan/10 pb-2 uppercase tracking-widest italic mt-8 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sepm-cyan" /> Line Voltage (ON)
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="L1" {...register(`${id}.volts_on.l1`)} placeholder="V" disabled={disabled} />
          <Input label="L2" {...register(`${id}.volts_on.l2`)} placeholder="V" disabled={disabled} />
          <Input label="L3" {...register(`${id}.volts_on.l3`)} placeholder="V" disabled={disabled} />
        </div>
        <div className="text-[10px] font-black text-lyft-lime border-b border-lyft-lime/10 pb-2 uppercase tracking-widest italic mt-8 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-lyft-lime" /> Performance Metrics
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Amps" {...register(`${id}.amps.l1`)} placeholder="A" disabled={disabled} />
          <Input label="Megs" {...register(`${id}.meg.l1`)} placeholder="M" disabled={disabled} />
          <Input label="Ohms" {...register(`${id}.ohms.l1`)} placeholder="Ω" disabled={disabled} />
        </div>
      </div>
    </FieldGroup>
  );
}

function ElectricalStep({ register, disabled }: any) {
  return (
    <div className="space-y-6">
      <PumpSection id="pump1Electrical" title="Pump No. 1 - Electrical" register={register} disabled={disabled} />
      <PumpSection id="pump2Electrical" title="Pump No. 2 - Electrical" register={register} disabled={disabled} />
    </div>
  );
}

function PumpEval({ id, index, register, condOptions, values, setValue, getValues, disabled }: any) {
  const images = values?.[id]?.images || [];

  return (
    <FieldGroup title={`Pump No. ${index} Evaluation`}>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Meter Reading" {...register(`${id}.meterReading`)} disabled={disabled} />
        <Input label="Runtime (hrs)" {...register(`${id}.runtime`)} disabled={disabled} />
      </div>
      <Select label="Condition" options={condOptions} {...register(`${id}.condition`)} disabled={disabled} />
      
      <div className="pt-4 mt-4 border-t border-slate-100">
        <MultiImageUpload 
          label="Performance Media" 
          images={images}
          onAdd={(img) => {
            const current = getValues(`${id}.images`) || [];
            setValue(`${id}.images`, [...current, img], { shouldDirty: true });
          }}
          onRemove={(idx) => {
            const current = getValues(`${id}.images`) || [];
            setValue(`${id}.images`, current.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
          }}
          disabled={disabled}
        />
      </div>
    </FieldGroup>
  );
}

function PumpsStep({ register, setValue, getValues, values, disabled }: any) {
  const condOptions = [' - - - - - ', 'Good', 'Fair', 'Poor', 'N/A'];
  
  return (
    <div className="space-y-10">
      <PumpEval id="pump1Evaluation" index={1} register={register} condOptions={condOptions} values={values} setValue={setValue} getValues={getValues} disabled={disabled} />
      <PumpEval id="pump2Evaluation" index={2} register={register} condOptions={condOptions} values={values} setValue={setValue} getValues={getValues} disabled={disabled} />
      <FieldGroup title="Station Security Test">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Select label="Visual Alarm" options={condOptions} {...register('visualAlarmTest.condition')} disabled={disabled} />
            <Input label="Visual Test Notes" {...register('visualAlarmTest.notes')} disabled={disabled} />
            <MultiImageUpload 
              label="Visual Test Media" 
              images={values?.visualAlarmTest?.images || []}
              onAdd={(img) => {
                const current = getValues('visualAlarmTest.images') || [];
                setValue('visualAlarmTest.images', [...current, img], { shouldDirty: true });
              }}
              onRemove={(idx) => {
                const current = getValues('visualAlarmTest.images') || [];
                setValue('visualAlarmTest.images', current.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
              }}
              disabled={disabled}
            />
          </div>
          <div className="space-y-4">
            <Select label="Audible Alarm" options={condOptions} {...register('audibleAlarmTest.condition')} disabled={disabled} />
            <Input label="Audible Test Notes" {...register('audibleAlarmTest.notes')} disabled={disabled} />
            <MultiImageUpload 
              label="Audible Test Media" 
              images={values?.audibleAlarmTest?.images || []}
              onAdd={(img) => {
                const current = getValues('audibleAlarmTest.images') || [];
                setValue('audibleAlarmTest.images', [...current, img], { shouldDirty: true });
              }}
              onRemove={(idx) => {
                const current = getValues('audibleAlarmTest.images') || [];
                setValue('audibleAlarmTest.images', current.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
              }}
              disabled={disabled}
            />
          </div>
        </div>
      </FieldGroup>
    </div>
  );
}

function WetWellStep({ register, setValue, getValues, values, disabled }: any) {
  const condOptions = [' - - - - - ', 'Good', 'Fair', 'Poor', 'N/A'];
  const fields = [
    { id: 'sideRails', label: 'Side Rails' },
    { id: 'brackets', label: 'Brackets' },
    { id: 'piping', label: 'Piping' },
    { id: 'flanges', label: 'Flanges' },
    { id: 'plugValves', label: 'Plug Valves' },
    { id: 'checkValves', label: 'Check Valves' },
    { id: 'floats', label: 'Floats' },
    { id: 'overallWell', label: 'Overall Station' }
  ];

  return (
    <>
      <FieldGroup title="Structural Integrity Check">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-6">
          {fields.map(f => (
            <Select key={f.id} label={f.label} options={condOptions} {...register(`wetWell.${f.id}`)} disabled={disabled} />
          ))}
        </div>
        <Input label="Structural Notes" {...register('wetWell.notes')} disabled={disabled} />
        
        <div className="pt-6 mt-6 border-t border-slate-100">
          <MultiImageUpload 
            label="Structural Media Capture" 
            images={values?.wetWell?.images || []}
            onAdd={(img) => {
              const current = getValues('wetWell.images') || [];
              setValue('wetWell.images', [...current, img], { shouldDirty: true });
            }}
            onRemove={(idx) => {
              const current = getValues('wetWell.images') || [];
              setValue('wetWell.images', current.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
            }}
            disabled={disabled}
          />
        </div>
      </FieldGroup>
    </>
  );
}

function ControlsStep({ register, setValue, getValues, values, disabled }: any) {
  const condOptions = [' - - - - - ', 'Good', 'Fair', 'Poor', 'N/A'];
  const fields = [
    { id: 'boxCondition', label: 'Box Condition' },
    { id: 'breakers', label: 'Breakers' },
    { id: 'starters', label: 'Starters' },
    { id: 'relays', label: 'Relays' },
    { id: 'contactors', label: 'Contactors' },
    { id: 'alternators', label: 'Alternators' },
    { id: 'controlConnections', label: 'Control Connections' },
    { id: 'hoaSwitches', label: 'HOA Switches' },
    { id: 'levelControl', label: 'Level Control System' }
  ];

  return (
    <FieldGroup title="Control Box Connections">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(f => (
            <Select key={f.id} label={f.label} options={condOptions} {...register(`controlBox.${f.id}`)} disabled={disabled} />
        ))}
      </div>
      <Input label="Notes" {...register('controlBox.notes')} disabled={disabled} />
      
      <div className="pt-6 mt-6 border-t border-slate-100">
        <MultiImageUpload 
          label="Enclosure Media Gallery" 
          images={values?.controlBox?.images || []}
          onAdd={(img) => {
            const current = getValues('controlBox.images') || [];
            setValue('controlBox.images', [...current, img], { shouldDirty: true });
          }}
          onRemove={(idx) => {
            const current = getValues('controlBox.images') || [];
            setValue('controlBox.images', current.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
          }}
          disabled={disabled}
        />
      </div>
    </FieldGroup>
  );
}

function ServiceStep({ register, setValue, getValues, values, disabled }: any) {
  return (
    <>
      <FieldGroup title="Manifest Info">
        <Input label="Manifest #" {...register('manifest.number')} disabled={disabled} />
        <Input label="Disposal Site" {...register('manifest.disposalSite')} disabled={disabled} />
        <Input label="Disposal Method" {...register('manifest.disposalMethod')} disabled={disabled} />
        <Input label="Volume Pumped (gals)" {...register('manifest.volumeGals')} disabled={disabled} />
        <Input label="Pumping Contractor" {...register('manifest.pumpingContractor')} disabled={disabled} />
      </FieldGroup>
      <FieldGroup title="Generator Service">
        <Input label="Last Service Date" type="date" {...register('generator.lastServiceDate')} disabled={disabled} />
        <Input label="Next Service Date" type="date" {...register('generator.nextServiceDate')} disabled={disabled} />
        <Input label="Next Inspection Due" type="date" {...register('generator.nextInspectionDate')} disabled={disabled} />
        <Input label="Generator Notes" {...register('generator.notes')} disabled={disabled} />
      </FieldGroup>
      <FieldGroup title="Remote Alarm System">
        <Input label="System Brand" {...register('remoteAlarm.brand')} disabled={disabled} />
        <Select label="Condition" options={[' - - - - - ', 'Good', 'Fair', 'Poor', 'N/A']} {...register('remoteAlarm.condition')} disabled={disabled} />
        <Input label="Notes" {...register('remoteAlarm.notes')} disabled={disabled} />
        
        <div className="pt-4 mt-4 border-t border-slate-100">
          <MultiImageUpload 
            label="Remote Alarm Status Photos" 
            images={values?.remoteAlarm?.images || []}
            onAdd={(img) => {
              const current = getValues('remoteAlarm.images') || [];
              setValue('remoteAlarm.images', [...current, img], { shouldDirty: true });
            }}
            onRemove={(idx) => {
              const current = getValues('remoteAlarm.images') || [];
              setValue('remoteAlarm.images', current.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
            }}
            disabled={disabled}
          />
        </div>
      </FieldGroup>
    </>
  );
}

function ReviewStep({ values, register, disabled }: any) {
  return (
    <div className="space-y-8 pb-32">
      <div className="text-center py-10">
        <div className="w-24 h-24 bg-sepm-cyan/10 text-sepm-cyan rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-sepm-cyan/10 ring-8 ring-sepm-cyan/5">
          <ShieldCheck size={48} />
        </div>
        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-none italic text-sepm-dark">
          {disabled ? 'Report Review' : 'Final Review'}
        </h2>
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-3">
          {disabled ? 'This report is locked and verified' : 'Authentication Required for Sync'}
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-[3rem] p-10 space-y-8 shadow-sm">
        <div className="flex justify-between items-center border-b border-slate-200 pb-6">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Work Order</span>
          <span className="font-black text-sepm-cyan text-xl tracking-tighter">#{values.workOrderNo || '---'}</span>
        </div>
        <div className="flex justify-between items-center border-b border-slate-200 pb-6">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Location ID</span>
          <span className="text-lg font-black text-slate-900 tracking-tight">STORE #{values.storeNo || '---'}</span>
        </div>
        <div className="flex justify-between items-center border-b border-slate-200 pb-6">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Arrival</span>
          <span className="text-sm font-bold text-slate-600">{values.arrivalDateTime ? format(new Date(values.arrivalDateTime), 'PPp') : '---'}</span>
        </div>
        {disabled && values.submittedAt && (
           <div className="flex justify-between items-center border-b border-slate-200 pb-6">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Submission Date</span>
            <span className="text-sm font-bold text-slate-600">{format(new Date(values.submittedAt), 'PPp')}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Alarm Status</span>
          <span className={cn(
            "text-[10px] px-4 py-1.5 rounded-full font-black uppercase tracking-widest",
            values.alarmStatus === 'NORMAL' ? "bg-lyft-lime/10 text-lyft-lime" : "bg-red-500/10 text-red-500"
          )}>{values.alarmStatus}</span>
        </div>
      </div>
      
      <div className="p-8 bg-sepm-dark rounded-3xl space-y-6">
        <p className="text-[10px] text-white/40 font-bold tracking-tight leading-relaxed uppercase">
          Protocol certification: By committing this report, I verify that all safety protocols were met on {format(new Date(), 'PPP')}. This encrypted manifest will be pushed to the SEPM Logistics Cloud immediately upon sync.
        </p>
        
        <div className="pt-6 border-t border-white/5">
          <Input 
            label="Departure Date & Time" 
            type="datetime-local" 
            {...register('departureDateTime')}
            disabled={disabled}
            className="white-input w-full rounded-xl md:rounded-2xl px-5 py-4 text-sm font-bold bg-white/5 border-white/10 text-white placeholder:text-white/20"
          />
        </div>
      </div>
    </div>
  );
}
