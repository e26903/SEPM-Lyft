import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InspectionData } from '../types';
import { format } from 'date-fns';

export async function generateInspectionPDF(data: InspectionData) {
  const doc = new jsPDF();

  // Header Background
  doc.setFillColor(0, 153, 164); // SEPM Cyan
  doc.rect(0, 0, 210, 40, 'F');

  // Text Colors
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('SEPM CONSTRUCTION', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('818 Verdun Road, Oneida, TN 37841', 105, 25, { align: 'center' });
  doc.setFontSize(14);
  doc.text('LIFT STATION MAINTENANCE INSPECTION REPORT', 105, 33, { align: 'center' });

  // Reset text color for body
  doc.setTextColor(0, 0, 0);

  // WO & Info Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Work Order #: ${data.workOrderNo}`, 14, 50);
  doc.text(`Store #: ${data.storeNo}`, 14, 56);
  doc.setFont('helvetica', 'normal');
  doc.text(`Arrival: ${format(new Date(data.arrivalDateTime), 'PPpp')}`, 14, 62);
  doc.text(`Departure: ${data.departureDateTime ? format(new Date(data.departureDateTime), 'PPpp') : '---'}`, 14, 68);
  doc.text(`Technician: ${data.technicianName}`, 14, 74);

  const address = `${data.streetAddress1}, ${data.city}, ${data.state} ${data.zipcode}`;
  doc.text(address, 14, 80);

  // Property Table
  autoTable(doc, {
    startY: 86,
    head: [['Property Classification', 'Inspection Type', 'Station Type', 'Alarm Status']],
    body: [[data.propertyClassification || '---', data.inspectionType, data.liftStationType || '---', data.alarmStatus]],
    theme: 'striped',
    headStyles: { fillColor: [45, 62, 80] }
  });

  // Electrical Table
  doc.setFont('helvetica', 'bold');
  let currentY = (doc as any).lastAutoTable.finalY + 10;
  doc.text('ELECTRICAL EVALUATION', 14, currentY);
  
  const pump1Data = [
    ['Pump 1 (Off)', data.pump1Electrical.volts_off.l1, data.pump1Electrical.volts_off.l2, data.pump1Electrical.volts_off.l3],
    ['Pump 1 (On)', data.pump1Electrical.volts_on.l1, data.pump1Electrical.volts_on.l2, data.pump1Electrical.volts_on.l3],
    ['Pump 2 (Off)', data.pump2Electrical.volts_off.l1, data.pump2Electrical.volts_off.l2, data.pump2Electrical.volts_off.l3],
    ['Pump 2 (On)', data.pump2Electrical.volts_on.l1, data.pump2Electrical.volts_on.l2, data.pump2Electrical.volts_on.l3],
  ];

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Reading', 'L1', 'L2', 'L3']],
    body: pump1Data,
    theme: 'grid'
  });

  // Condition Tables
  doc.setFont('helvetica', 'bold');
  currentY = (doc as any).lastAutoTable.finalY + 10;
  doc.text('SITE SECURITY & WET WELL', 14, currentY);

  const conditionData = [
    ['Visual Alarm', data.visualAlarmTest.condition, data.visualAlarmTest.notes],
    ['Audible Alarm', data.audibleAlarmTest.condition, data.audibleAlarmTest.notes],
    ['Wet Well Side Rails', data.wetWell.sideRails, ''],
    ['Wet Well Brackets', data.wetWell.brackets, ''],
    ['Wet Well Piping', data.wetWell.piping, ''],
    ['Wet Well Floats', data.wetWell.floats, ''],
    ['Overall Well', data.wetWell.overallWell, data.wetWell.notes],
  ];

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Component', 'Condition', 'Notes']],
    body: conditionData,
    theme: 'striped'
  });

  // Control Box
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.text('CONTROL BOX CONNECTIONS', 14, 20);

  const controlData = [
    ['Box Condition', data.controlBox.boxCondition],
    ['Breakers', data.controlBox.breakers],
    ['Starters', data.controlBox.starters],
    ['Relays', data.controlBox.relays],
    ['Contactors', data.controlBox.contactors],
    ['HOA Switches', data.controlBox.hoaSwitches],
    ['Level Control', data.controlBox.levelControl],
  ];

  autoTable(doc, {
    startY: 25,
    head: [['Component', 'Condition']],
    body: controlData,
    theme: 'striped'
  });

  // Manifest & Service
  doc.setFont('helvetica', 'bold');
  currentY = (doc as any).lastAutoTable.finalY + 10;
  doc.text('MANIFEST & SERVICE LOGS', 14, currentY);

  const serviceData = [
    ['Manifest #', data.manifest.number],
    ['Volume (gals)', data.manifest.volumeGals],
    ['Last Gen Service', data.generator.lastServiceDate],
    ['Next Gen Service', data.generator.nextServiceDate],
    ['Remote Alarm Brand', data.remoteAlarm.brand],
  ];

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Record', 'Detail']],
    body: serviceData,
    theme: 'grid'
  });

  return doc;
}
