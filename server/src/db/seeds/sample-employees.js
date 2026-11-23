/**
 * Generates sample HR files for the bulk import (Administration → People → Import CSV).
 *
 *   node src/db/seeds/sample-employees.js [count]      (default 10,000)
 *
 * Writes:
 *   samples/employees-<count>.csv         a valid functional hierarchy under the CEO (asha@voyage.io)
 *   samples/employees-with-errors.csv     a few rows with deliberate mistakes, to see validation
 *
 * Deterministic (seeded), so every run produces the same people.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNT = Number(process.argv[2] || 10_000);
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../samples');
const CEO = 'asha@voyage.io';

let seed = 20261123;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];

const FIRST = ['Aarav', 'Aditi', 'Akash', 'Ananya', 'Arjun', 'Bhavya', 'Chetan', 'Deepa', 'Divya', 'Gaurav', 'Harini', 'Ishaan', 'Jaya', 'Karthik', 'Kavya', 'Lakshmi', 'Manish', 'Meghana', 'Nandini', 'Nikhil', 'Pooja', 'Pranav', 'Priya', 'Rahul', 'Ramya', 'Rohit', 'Sahana', 'Sandeep', 'Shreya', 'Siddharth', 'Sneha', 'Suresh', 'Swathi', 'Tarun', 'Varun', 'Vidya', 'Vikas', 'Vinay', 'Yamini', 'Zoya'];
const LAST = ['Acharya', 'Bhat', 'Chandra', 'Desai', 'Gowda', 'Hegde', 'Iyer', 'Joshi', 'Kamath', 'Kulkarni', 'Menon', 'Mishra', 'Nair', 'Patil', 'Pillai', 'Rao', 'Reddy', 'Shenoy', 'Sharma', 'Shetty', 'Singh', 'Srinivasan', 'Subramanian', 'Verma'];
const CITIES = ['Bengaluru', 'Bengaluru', 'Bengaluru', 'Mumbai', 'Chennai', 'Pune', 'Hyderabad', 'Coimbatore'];

// Four existing departments plus four new ones (created by the import with "create missing").
const BUS = [
  { dept: 'ENG', deptName: 'Engineering', cc: 'CC-210', ccName: 'Engineering R&D', head: 'Head of Engineering', role: 'Software Engineer' },
  { dept: 'SALES', deptName: 'Sales', cc: 'CC-310', ccName: 'Sales - West', head: 'Head of Sales', role: 'Account Executive' },
  { dept: 'FIN', deptName: 'Finance', cc: 'CC-410', ccName: 'Finance & Accounts', head: 'Head of Finance', role: 'Accountant' },
  { dept: 'OPS', deptName: 'Operations', cc: 'CC-100', ccName: 'Corporate', head: 'Head of Operations', role: 'Operations Executive' },
  { dept: 'HR', deptName: 'Human Resources', cc: 'CC-510', ccName: 'People & Culture', head: 'Head of HR', role: 'HR Executive' },
  { dept: 'QA', deptName: 'Quality Assurance', cc: 'CC-610', ccName: 'Quality', head: 'Head of Quality', role: 'QA Engineer' },
  { dept: 'IOT', deptName: 'Industrial IoT', cc: 'CC-710', ccName: 'IIoT Solutions', head: 'Head of IIoT', role: 'IoT Engineer' },
  { dept: 'DEL', deptName: 'Delivery', cc: 'CC-810', ccName: 'Customer Delivery', head: 'Head of Delivery', role: 'Delivery Engineer' },
];
const DIRECTORS_PER_BU = 6;
const MANAGERS_PER_DIRECTOR = 10;

// Quote fields that contain commas, quotes or line breaks (e.g. "Director, Engineering").
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const header = 'employee_id,name,email,manager_email,department_code,department_name,cost_center_code,cost_center_name,role,title,location,active';
const rows = [];
let n = 0;
const person = (managerEmail, bu, role, title) => {
  n += 1;
  const first = pick(FIRST);
  const last = pick(LAST);
  const email = `${first}.${last}.${n}`.toLowerCase() + '@utthunga.com';
  rows.push([`UT${String(10000 + n)}`, `${first} ${last}`, email, managerEmail, bu.dept, bu.deptName, bu.cc, bu.ccName, role, title, pick(CITIES), 'true'].map(csv).join(','));
  return email;
};

const managers = [];
for (const bu of BUS) {
  const head = person(CEO, bu, 'MANAGER', bu.head);
  for (let d = 0; d < DIRECTORS_PER_BU; d++) {
    const dir = person(head, bu, 'MANAGER', `Director, ${bu.deptName}`);
    for (let m = 0; m < MANAGERS_PER_DIRECTOR; m++) managers.push({ email: person(dir, bu, 'MANAGER', `${bu.deptName} Manager`), bu });
  }
}
// Spread the remaining employees evenly across managers (~20 each for 10k).
for (let i = 0; n < COUNT; i++) {
  const m = managers[i % managers.length];
  person(m.email, m.bu, 'EMPLOYEE', pick([m.bu.role, `Senior ${m.bu.role}`, `Associate ${m.bu.role}`]));
}

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `employees-${COUNT}.csv`);
fs.writeFileSync(file, [header, ...rows].join('\n') + '\n');

const bad = [
  header,
  'UT90001,Good Person,good.person@utthunga.com,asha@voyage.io,ENG,Engineering,CC-210,Engineering R&D,EMPLOYEE,Engineer,Bengaluru,true',
  'UT90002,,missing.name@utthunga.com,asha@voyage.io,ENG,,CC-210,,EMPLOYEE,Engineer,Pune,true',
  'UT90003,Bad Email,not-an-email,asha@voyage.io,ENG,,CC-210,,EMPLOYEE,Engineer,Pune,true',
  'UT90004,Ghost Manager,ghost.manager@utthunga.com,nobody@utthunga.com,ENG,,CC-210,,EMPLOYEE,Engineer,Pune,true',
  'UT90005,Loop A,loop.a@utthunga.com,loop.b@utthunga.com,ENG,,CC-210,,EMPLOYEE,Engineer,Pune,true',
  'UT90006,Loop B,loop.b@utthunga.com,loop.a@utthunga.com,ENG,,CC-210,,EMPLOYEE,Engineer,Pune,true',
  'UT90007,Wants Admin,wants.admin@utthunga.com,asha@voyage.io,OPS,,CC-100,,ADMIN,Admin,Chennai,true',
  'UT90001,Duplicate Id,duplicate.id@utthunga.com,asha@voyage.io,ENG,,CC-210,,EMPLOYEE,Engineer,Pune,true',
  'UT90009,Unknown Dept,unknown.dept@utthunga.com,asha@voyage.io,MARS,Mars Office,CC-999,Mars,EMPLOYEE,Engineer,Pune,maybe',
];
fs.writeFileSync(path.join(outDir, 'employees-with-errors.csv'), bad.join('\n') + '\n');

console.log(`Wrote ${rows.length.toLocaleString('en-IN')} people to ${file}`);
console.log(`  ${BUS.length} BU heads, ${BUS.length * DIRECTORS_PER_BU} directors, ${managers.length} managers, ${rows.length - BUS.length - BUS.length * DIRECTORS_PER_BU - managers.length} employees`);
