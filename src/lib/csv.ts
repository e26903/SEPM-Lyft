import Papa from 'papaparse';
import { InspectionData } from '../types';

export function exportToCSV(inspections: InspectionData[]) {
  // Flattening the complex object for CSV
  const flattened = inspections.map(i => ({
    id: i.id,
    workOrderNo: i.workOrderNo,
    storeNo: i.storeNo,
    city: i.city,
    state: i.state,
    status: i.status,
    createdAt: i.createdAt,
    technician: i.technicianName,
    pump1Amps: i.pump1Electrical.amps.l1,
    pump2Amps: i.pump2Electrical.amps.l1,
    wellCondition: i.wetWell.overallWell,
    notes: i.inspectionDetailsNotes
  }));

  const csv = Papa.unparse(flattened);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'sepm_inspections_export.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
