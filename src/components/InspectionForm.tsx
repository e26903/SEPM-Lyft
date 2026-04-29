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
import { cn, compressImage } from '../lib/utils';
import { InspectionData, Condition } from '../types';
import { saveInspection, getDestinationUrl, getDropboxToken, getImportedSites, getSiteMetadata } from '../lib/storage';
import { generateInspectionPDF } from '../lib/pdf';
import { SITES, Site } from '../data/sites';
import { Search as SearchIcon } from 'lucide-react';
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

const conditionSchema = z.enum(['Good', 'Fair', 'Poor', 'N/A', ' - - - - - ']).refine(val => val !== ' - - - - - ', {
  message: "Selection required"
});

const pumpElectricalSchema = z.object({
  volts_off: z.object({ l1: z.string().min(1), l2: z.string().min(1), l3: z.string().min(1) }),
  volts_on: z.object({ l1: z.string().min(1), l2: z.string().min(1), l3: z.string().min(1) }),
  amps: z.object({ l1: z.string().min(1), l2: z.string(), l3: z.string() }),
  meg: z.object({ l1: z.string().min(1), l2: z.string(), l3: z.string() }),
  ohms: z.object({ l1: z.string().min(1), l2: z.string(), l3: z.string() }),
});

const pumpEvaluationSchema = z.object({
  meterReading: z.string().min(1),
  runtime: z.string().min(1),
  condition: conditionSchema,
  images: z.array(z.string())
});

const validationSchema = z.object({
  id: z.string(),
  status: z.enum(['draft', 'submitted']),
  createdAt: z.string(),
  submittedAt: z.string().optional(),
  
  workOrderNo: z.string().min(1, "Work Order required"),
  arrivalDateTime: z.string().min(1, "Arrival time required"),
  technicianName: z.string().min(1, "Name required"),
  contractorCompany: z.string(),
  storeNo: z.string().min(1, "Store required"),
  streetAddress1: z.string(),
  streetAddress2: z.string(),
  city: z.string(),
  state: z.string(),
  zipcode: z.string(),

  propertyClassification: z.string().refine(val => val !== ' - - - - - ', "Required"),
  propertyClassificationOtherDetails: z.string().optional(),
  inspectionType: z.string().refine(val => val !== ' - - - - - ', "Required"),
  liftStationType: z.string().refine(val => val !== ' - - - - - ', "Required"),
  alarmStatus: z.string().refine(val => val !== ' - - - - - ', "Required"),
  ratingScore: z.number(),
  inspectionDetailsNotes: z.string(),

  pump1Electrical: pumpElectricalSchema,
  pump2Electrical: pumpElectricalSchema,

  pump1Evaluation: pumpEvaluationSchema,
  pump2Evaluation: pumpEvaluationSchema,

  visualAlarmTest: z.object({ condition: conditionSchema, notes: z.string(), images: z.array(z.string()) }),
  audibleAlarmTest: z.object({ condition: conditionSchema, notes: z.string(), images: z.array(z.string()) }),
  overallSiteCondition: z.object({ condition: conditionSchema, notes: z.string(), images: z.array(z.string()) }),

  wetWell: z.object({
    sideRails: conditionSchema,
    brackets: conditionSchema,
    piping: conditionSchema,
    flanges: conditionSchema,
    plugValves: conditionSchema,
    checkValves: conditionSchema,
    floats: conditionSchema,
    overallWell: conditionSchema,
    notes: z.string(),
    images: z.array(z.string())
  }),

  controlBox: z.object({
    boxCondition: conditionSchema,
    breakers: conditionSchema,
    starters: conditionSchema,
    relays: conditionSchema,
    contactors: conditionSchema,
    alternators: conditionSchema,
    controlConnections: conditionSchema,
    hoaSwitches: conditionSchema,
    levelControl: conditionSchema,
    notes: z.string(),
    images: z.array(z.string())
  }),

  manifest: z.object({
    number: z.string().min(1, "Required"),
    disposalSite: z.string().min(1, "Required"),
    disposalMethod: z.string().min(1, "Required"),
    volumeGals: z.string().min(1, "Required"),
    pumpingContractor: z.string(),
  }),

  generator: z.object({
    lastServiceDate: z.string(),
    nextServiceDate: z.string(),
    nextInspectionDate: z.string(),
    notes: z.string(),
  }),

  remoteAlarm: z.object({
    brand: z.string(),
    condition: conditionSchema,
    notes: z.string(),
    images: z.array(z.string())
  }),

  departureDateTime: z.string().min(1, "Departure time required"),
});

const STEP_FIELDS: Record<string, string[]> = {
  general: ['workOrderNo', 'arrivalDateTime', 'technicianName', 'storeNo', 'propertyClassification', 'inspectionType', 'liftStationType', 'alarmStatus'],
  electrical: [
    'pump1Electrical.volts_off.l1', 'pump1Electrical.volts_off.l2', 'pump1Electrical.volts_off.l3',
    'pump1Electrical.volts_on.l1', 'pump1Electrical.volts_on.l2', 'pump1Electrical.volts_on.l3',
    'pump1Electrical.amps.l1', 'pump1Electrical.meg.l1', 'pump1Electrical.ohms.l1',
    'pump2Electrical.volts_off.l1', 'pump2Electrical.volts_off.l2', 'pump2Electrical.volts_off.l3',
    'pump2Electrical.volts_on.l1', 'pump2Electrical.volts_on.l2', 'pump2Electrical.volts_on.l3',
    'pump2Electrical.amps.l1', 'pump2Electrical.meg.l1', 'pump2Electrical.ohms.l1'
  ],
  pumps: [
    'pump1Evaluation.meterReading', 'pump1Evaluation.runtime', 'pump1Evaluation.condition',
    'pump2Evaluation.meterReading', 'pump2Evaluation.runtime', 'pump2Evaluation.condition',
    'visualAlarmTest.condition', 'audibleAlarmTest.condition'
  ],
  wetwell: [
    'wetWell.sideRails', 'wetWell.brackets', 'wetWell.piping', 'wetWell.flanges', 'wetWell.plugValves', 'wetWell.checkValves', 'wetWell.floats', 'wetWell.overallWell'
  ],
  controls: [
    'controlBox.boxCondition', 'controlBox.breakers', 'controlBox.starters', 'controlBox.relays', 'controlBox.contactors', 'controlBox.alternators', 'controlBox.controlConnections', 'controlBox.hoaSwitches', 'controlBox.levelControl'
  ],
  service: [
    'manifest.number', 'manifest.disposalSite', 'manifest.disposalMethod', 'manifest.volumeGals'
  ],
  review: [
    'departureDateTime'
  ]
};

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

  const { register, handleSubmit, watch, setValue, getValues, trigger, formState: { errors } } = useForm<InspectionData>({
    defaultValues: inspection,
    resolver: zodResolver(validationSchema)
  });

  const formValues = watch();

  const handleNext = async () => {
    const currentStepFields = STEP_FIELDS[currentStepId] || [];
    const isValid = await trigger(currentStepFields as any);

    if (!isValid) {
      alert("Validation Error: Please complete all required fields highlighted in this section.");
      return;
    }

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
      case 'general': return <GeneralInfoStep register={register} setValue={setValue} watch={watch} disabled={isReadOnly} errors={errors} />;
      case 'electrical': return <ElectricalStep register={register} disabled={isReadOnly} errors={errors} />;
      case 'pumps': return <PumpsStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} errors={errors} />;
      case 'wetwell': return <WetWellStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} errors={errors} />;
      case 'controls': return <ControlsStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} errors={errors} />;
      case 'service': return <ServiceStep register={register} setValue={setValue} getValues={getValues} values={formValues} disabled={isReadOnly} errors={errors} />;
      case 'review': return <ReviewStep values={formValues} register={register} setValue={setValue} getValues={getValues} disabled={isReadOnly} errors={errors} />;
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
            stepIndex === STEPS.length - 1 ? (isReadOnly ? "bg-slate-800 text-white" : "bg-sepm-dark text-white") : "bg-sepm-cyan text-slate-950",
            submitting && "opacity-50 cursor-wait"
          )}
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
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

function Input({ label, disabled, error, className, ...props }: any) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60 grayscale-[0.2]")}>
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
        {error && <span className="text-[9px] font-bold text-red-500 uppercase italic">{error.message}</span>}
      </div>
      <input 
        disabled={disabled}
        className={cn(
          "white-input w-full rounded-xl md:rounded-2xl px-5 py-4 text-sm font-bold placeholder:text-slate-300 disabled:cursor-not-allowed transition-all",
          error && "border-red-500 bg-red-50/50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function Select({ label, options, disabled, error, ...props }: any) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60 grayscale-[0.2]")}>
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
        {error && <span className="text-[9px] font-bold text-red-500 uppercase italic">{error.message}</span>}
      </div>
      <div className="relative">
        <select 
          disabled={disabled}
          className={cn(
            "white-input w-full rounded-xl md:rounded-2xl px-5 py-4 text-sm font-bold appearance-none disabled:cursor-not-allowed transition-all",
            error && "border-red-500 bg-red-50/50"
          )}
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
      
      // Compress image before adding
      try {
        const compressed = await compressImage(img);
        onAdd(compressed);
      } catch (err) {
        console.error("Compression failed, using original:", err);
        onAdd(img);
      }
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
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full transition-opacity flex items-center justify-center hover:bg-red-600 active:scale-90 shadow-lg z-10"
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

function GeneralInfoStep({ register, setValue, watch, disabled, errors }: any) {
  const [storeSearch, setStoreSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [allSites, setAllSites] = useState<Site[]>(SITES);
  const [metadata, setMetadata] = useState<any>(null);

  const loadSites = React.useCallback(() => {
    getImportedSites().then(imported => {
      const combined = (imported && imported.length > 0) ? [...imported] : [];
      const existingNos = new Set(combined.map(s => String(s.storeNo).toLowerCase().trim()));
      
      SITES.forEach(s => {
        const normalized = String(s.storeNo).toLowerCase().trim();
        if (!existingNos.has(normalized)) {
          combined.push(s);
        }
      });
      
      setAllSites(combined);
      if (imported?.length > 0) {
        console.log(`Diagnostic: Loaded ${combined.length} total stations (${imported.length} imported).`);
      }
    });
    getSiteMetadata().then(setMetadata);
  }, []);

  React.useEffect(() => {
    loadSites();
  }, [loadSites]);
  
  // Fuzzy search and filter
  const filteredSites = React.useMemo(() => {
    if (!storeSearch || disabled) return [];
    const search = storeSearch.toLowerCase().trim();
    if (search.length < 1) return [];

    return allSites
      .filter(s => {
        const storeNo = String(s.storeNo || '').toLowerCase();
        const city = String(s.city || '').toLowerCase();
        const address = String(s.streetAddress1 || '').toLowerCase();
        
        return storeNo.includes(search) || 
               city.includes(search) || 
               address.includes(search);
      })
      .sort((a, b) => {
        // Boost exact store no matches to top
        const aNo = String(a.storeNo || '').toLowerCase();
        const bNo = String(b.storeNo || '').toLowerCase();
        if (aNo === search) return -1;
        if (bNo === search) return 1;
        return 0;
      })
      .slice(0, 50); 
  }, [storeSearch, allSites, disabled]);

  const handleSelectSite = (site: Site) => {
    if (disabled) return;
    setValue('storeNo', site.storeNo, { shouldValidate: true });
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
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Station Search</label>
            {errors?.storeNo && <span className="text-[9px] font-bold text-red-500 uppercase italic">{errors.storeNo.message}</span>}
          </div>
          <div className="relative">
            <input 
              disabled={disabled}
              className={cn(
                "white-input w-full rounded-2xl px-5 py-4 text-sm font-black pr-12 disabled:opacity-40 disabled:cursor-not-allowed transition-all",
                errors?.storeNo && "border-red-500 bg-red-50/50"
              )}
              placeholder={disabled ? "Station Locked" : "Store ID / City / Street..."}
              value={storeSearch}
              onChange={(e) => {
                setStoreSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => {
                if (!disabled) {
                  setShowDropdown(true);
                  loadSites();
                }
              }}
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
                {filteredSites.length > 0 ? (
                  filteredSites.map(s => (
                    <button
                      key={`${s.storeNo}-${s.streetAddress1}`}
                      type="button"
                      onClick={() => handleSelectSite(s)}
                      className="w-full text-left p-5 hover:bg-sepm-cyan group transition-colors border-b border-slate-50 last:border-b-0"
                    >
                      <div className="font-black text-sm text-slate-900 group-hover:text-white">Store #{s.storeNo}</div>
                      <div className="text-[10px] text-slate-400 group-hover:text-white/80 font-bold uppercase tracking-tight">{s.streetAddress1}, {s.city}</div>
                    </button>
                  ))
                ) : (
                  <div className="p-10 text-center space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">No Matching Stations Found</p>
                    {metadata ? (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[9px] text-slate-500 font-bold uppercase leading-relaxed italic">
                          Database contains {metadata.count} sites from {metadata.fileName}.
                          <br />Last sync: {new Date(metadata.date).toLocaleString()}
                        </p>
                        <p className="text-[8px] text-red-500 font-black uppercase mt-2">
                          If 515 or 660 are missing, verify they exist in the source sheet.
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <p className="text-[9px] text-amber-700 font-bold uppercase leading-relaxed italic">
                          Database contains built-in sites only. 
                          <br />Verify Remote Sync in Configuration for new locations.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Hidden register for storeNo */}
          <input type="hidden" {...register('storeNo')} />
        </div>
      </FieldGroup>

      <FieldGroup title="Inspection Header">
        <Input 
          label="Work Order #" 
          {...register('workOrderNo')} 
          placeholder="WO-XXXX-XXXX" 
          disabled={disabled}
          error={errors?.workOrderNo}
        />
        <Input 
          label="Technician Name" 
          {...register('technicianName')} 
          placeholder="Enter full name..." 
          disabled={disabled}
          error={errors?.technicianName}
        />
        <Input 
          label="Arrival Date & Time" 
          type="datetime-local" 
          {...register('arrivalDateTime')} 
          disabled={disabled}
          error={errors?.arrivalDateTime}
        />
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
          error={errors?.propertyClassification}
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
          <Select label="Inspection Type" options={[' - - - - - ', 'PREVENTATIVE', 'EMERGENCY']} {...register('inspectionType')} disabled={disabled} error={errors?.inspectionType} />
          <Select label="Lift Station Type" options={[' - - - - - ', 'Primary', 'Secondary']} {...register('liftStationType')} disabled={disabled} error={errors?.liftStationType} />
        </div>
        <Select label="Station Status" options={[' - - - - - ', 'NORMAL', 'ALARM']} {...register('alarmStatus')} disabled={disabled} error={errors?.alarmStatus} />
      </FieldGroup>
    </>
  );
}

function PumpSection({ id, title, register, disabled, errors }: { id: string; title: string; register: any; disabled?: boolean; errors?: any }) {
  const sectionErrors = errors?.[id];

  return (
    <FieldGroup title={title}>
      <div className="space-y-4">
        <div className="text-[10px] font-black text-sepm-cyan border-b border-sepm-cyan/10 pb-2 uppercase tracking-widest italic flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sepm-cyan" /> Line Voltage (OFF)
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="L1" {...register(`${id}.volts_off.l1`)} placeholder="V" disabled={disabled} error={sectionErrors?.volts_off?.l1} />
          <Input label="L2" {...register(`${id}.volts_off.l2`)} placeholder="V" disabled={disabled} error={sectionErrors?.volts_off?.l2} />
          <Input label="L3" {...register(`${id}.volts_off.l3`)} placeholder="V" disabled={disabled} error={sectionErrors?.volts_off?.l3} />
        </div>
        <div className="text-[10px] font-black text-sepm-cyan border-b border-sepm-cyan/10 pb-2 uppercase tracking-widest italic mt-8 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sepm-cyan" /> Line Voltage (ON)
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="L1" {...register(`${id}.volts_on.l1`)} placeholder="V" disabled={disabled} error={sectionErrors?.volts_on?.l1} />
          <Input label="L2" {...register(`${id}.volts_on.l2`)} placeholder="V" disabled={disabled} error={sectionErrors?.volts_on?.l2} />
          <Input label="L3" {...register(`${id}.volts_on.l3`)} placeholder="V" disabled={disabled} error={sectionErrors?.volts_on?.l3} />
        </div>
        <div className="text-[10px] font-black text-lyft-lime border-b border-lyft-lime/10 pb-2 uppercase tracking-widest italic mt-8 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-lyft-lime" /> Performance Metrics
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Amps" {...register(`${id}.amps.l1`)} placeholder="A" disabled={disabled} error={sectionErrors?.amps?.l1} />
          <Input label="Megs" {...register(`${id}.meg.l1`)} placeholder="M" disabled={disabled} error={sectionErrors?.meg?.l1} />
          <Input label="Ohms" {...register(`${id}.ohms.l1`)} placeholder="Ω" disabled={disabled} error={sectionErrors?.ohms?.l1} />
        </div>
      </div>
    </FieldGroup>
  );
}

function ElectricalStep({ register, disabled, errors }: any) {
  return (
    <div className="space-y-6">
      <PumpSection id="pump1Electrical" title="Pump No. 1 - Electrical" register={register} disabled={disabled} errors={errors} />
      <PumpSection id="pump2Electrical" title="Pump No. 2 - Electrical" register={register} disabled={disabled} errors={errors} />
    </div>
  );
}

function PumpEval({ id, index, register, condOptions, values, setValue, getValues, disabled, errors }: any) {
  const images = values?.[id]?.images || [];
  const evalErrors = errors?.[id];

  return (
    <FieldGroup title={`Pump No. ${index} Evaluation`}>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Meter Reading" {...register(`${id}.meterReading`)} disabled={disabled} error={evalErrors?.meterReading} />
        <Input label="Runtime (hrs)" {...register(`${id}.runtime`)} disabled={disabled} error={evalErrors?.runtime} />
      </div>
      <Select label="Condition" options={condOptions} {...register(`${id}.condition`)} disabled={disabled} error={evalErrors?.condition} />
      
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

function PumpsStep({ register, setValue, getValues, values, disabled, errors }: any) {
  const condOptions = [' - - - - - ', 'Good', 'Fair', 'Poor', 'N/A'];
  
  return (
    <div className="space-y-10">
      <PumpEval id="pump1Evaluation" index={1} register={register} condOptions={condOptions} values={values} setValue={setValue} getValues={getValues} disabled={disabled} errors={errors} />
      <PumpEval id="pump2Evaluation" index={2} register={register} condOptions={condOptions} values={values} setValue={setValue} getValues={getValues} disabled={disabled} errors={errors} />
      <FieldGroup title="Station Security Test">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Select label="Visual Alarm" options={condOptions} {...register('visualAlarmTest.condition')} disabled={disabled} error={errors?.visualAlarmTest?.condition} />
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
            <Select label="Audible Alarm" options={condOptions} {...register('audibleAlarmTest.condition')} disabled={disabled} error={errors?.audibleAlarmTest?.condition} />
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

function WetWellStep({ register, setValue, getValues, values, disabled, errors }: any) {
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
            <Select key={f.id} label={f.label} options={condOptions} {...register(`wetWell.${f.id}`)} disabled={disabled} error={errors?.wetWell?.[f.id]} />
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

function ControlsStep({ register, setValue, getValues, values, disabled, errors }: any) {
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
            <Select key={f.id} label={f.label} options={condOptions} {...register(`controlBox.${f.id}`)} disabled={disabled} error={errors?.controlBox?.[f.id]} />
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

function ServiceStep({ register, setValue, getValues, values, disabled, errors }: any) {
  return (
    <>
      <FieldGroup title="Manifest Info">
        <Input label="Manifest #" {...register('manifest.number')} disabled={disabled} error={errors?.manifest?.number} />
        <Input label="Disposal Site" {...register('manifest.disposalSite')} disabled={disabled} error={errors?.manifest?.disposalSite} />
        <Input label="Disposal Method" {...register('manifest.disposalMethod')} disabled={disabled} error={errors?.manifest?.disposalMethod} />
        <Input label="Volume Pumped (gals)" {...register('manifest.volumeGals')} disabled={disabled} error={errors?.manifest?.volumeGals} />
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
        <Select label="Condition" options={[' - - - - - ', 'Good', 'Fair', 'Poor', 'N/A']} {...register('remoteAlarm.condition')} disabled={disabled} error={errors?.remoteAlarm?.condition} />
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

function ReviewStep({ values, register, setValue, getValues, disabled, errors }: any) {
  // Collect all photos from all sections for final review/deletion
  const sectionsWithImages = [
    { id: 'pump1Evaluation.images', label: 'Pump 1' },
    { id: 'pump2Evaluation.images', label: 'Pump 2' },
    { id: 'visualAlarmTest.images', label: 'Visual Alarm' },
    { id: 'audibleAlarmTest.images', label: 'Audible Alarm' },
    { id: 'wetWell.images', label: 'Station Structure' },
    { id: 'controlBox.images', label: 'Control Box' },
    { id: 'remoteAlarm.images', label: 'Remote Alarm' },
    { id: 'overallSiteCondition.images', label: 'Overall Site' }
  ];

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
        {/* ... existing fields ... */}
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

      {/* Photo Summary & Deletion */}
      <div className="space-y-6">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] pl-1">Media Manifest Review</h3>
        <div className="space-y-4">
          {sectionsWithImages.map(section => {
            const imgs = (values as any)[section.id.split('.')[0]]?.[section.id.split('.')[1]] || [];
            if (imgs.length === 0) return null;

            return (
              <div key={section.id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-sepm-dark uppercase tracking-widest">{section.label}</span>
                  <span className="text-[9px] font-bold text-slate-400 px-2 py-0.5 bg-slate-50 rounded-full">{imgs.length} Photos</span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {imgs.map((img: string, i: number) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-50">
                      <img src={img} alt="review" className="w-full h-full object-cover" />
                      {!disabled && (
                        <button 
                          type="button"
                          onClick={() => {
                            const pathArr = section.id.split('.');
                            const current = (getValues() as any)[pathArr[0]][pathArr[1]];
                            const filtered = current.filter((_: any, idx: number) => idx !== i);
                            setValue(section.id as any, filtered, { shouldDirty: true });
                          }}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow-md z-10"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {sectionsWithImages.every(s => !((values as any)[s.id.split('.')[0]]?.[s.id.split('.')[1]])?.length) && (
            <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl text-center text-slate-300 font-bold uppercase tracking-widest text-[9px]">
              No protocol media attached to this report
            </div>
          )}
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
            error={errors?.departureDateTime}
            className="white-input w-full rounded-xl md:rounded-2xl px-5 py-4 text-sm font-bold bg-white/5 border-white/10 text-white placeholder:text-white/20"
          />
        </div>
      </div>
    </div>
  );
}
