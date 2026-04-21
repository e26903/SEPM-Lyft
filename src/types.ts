export type Condition = 'Good' | 'Fair' | 'Poor' | 'N/A' | ' - - - - - ';

export interface PumpElectricalData {
  volts_off: { l1: string; l2: string; l3: string };
  volts_on: { l1: string; l2: string; l3: string };
  amps: { l1: string; l2: string; l3: string };
  meg: { l1: string; l2: string; l3: string };
  ohms: { l1: string; l2: string; l3: string };
}

export interface PumpEvaluation {
  meterReading: string;
  runtime: string;
  condition: Condition;
  images: string[];
}

export interface InspectionData {
  id: string;
  status: 'draft' | 'submitted';
  createdAt: string;
  submittedAt?: string;

  // Header
  workOrderNo: string;
  arrivalDateTime: string;
  departureDateTime: string;
  contractorCompany: string;
  technicianName: string;
  storeNo: string;
  streetAddress1: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipcode: string;

  // Classification
  propertyClassification: string;
  propertyClassificationOtherDetails?: string;
  inspectionType: string;
  liftStationType: string;
  alarmStatus: string;
  ratingScore: number; // 0-100 or similar for the "RatingBar"
  inspectionDetailsNotes: string;

  // Electrical
  pump1Electrical: PumpElectricalData;
  pump2Electrical: PumpElectricalData;

  // Pump Evaluation
  pump1Evaluation: PumpEvaluation;
  pump2Evaluation: PumpEvaluation;

  // Site Security
  visualAlarmTest: { condition: Condition; notes: string; images: string[] };
  audibleAlarmTest: { condition: Condition; notes: string; images: string[] };
  overallSiteCondition: { condition: Condition; notes: string; images: string[] };

  // Wet Well
  wetWell: {
    sideRails: Condition;
    brackets: Condition;
    piping: Condition;
    flanges: Condition;
    plugValves: Condition;
    checkValves: Condition;
    floats: Condition;
    overallWell: Condition;
    notes: string;
    images: string[];
  };

  // Control Box
  controlBox: {
    boxCondition: Condition;
    breakers: Condition;
    starters: Condition;
    relays: Condition;
    contactors: Condition;
    alternators: Condition;
    controlConnections: Condition;
    hoaSwitches: Condition;
    levelControl: Condition;
    notes: string;
    images: string[];
  };

  // Manifest
  manifest: {
    number: string;
    disposalSite: string;
    disposalMethod: string;
    volumeGals: string;
    pumpingContractor: string;
  };

  // Generator
  generator: {
    lastServiceDate: string;
    nextServiceDate: string;
    nextInspectionDate: string;
    notes: string;
  };

  // Remote Alarm
  remoteAlarm: {
    brand: string;
    condition: Condition;
    notes: string;
    images: string[];
  };
}
