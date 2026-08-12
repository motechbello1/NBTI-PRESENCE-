type ReportRow = {
  user_id: string;
  work_date: string;
  sign_in_at: string | null;
  sign_out_at: string | null;
  status: string;
  hours_worked: number | null;
  early_departure: boolean;
  marked_by_admin: boolean;
  department?: string | null;
  department_code?: string | null;
};

type StaffRow = {
  id: string;
  full_name: string;
  staff_id?: string | null;
  department_id?: string | null;
  departments?: { id: string; name: string; code?: string | null } | null;
};

export type ReportScope = "board" | "department" | "individual" | "self";

export type ReportEvidence = ReturnType<typeof buildReportEvidence>;

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

export function workingDays(from: string, to: string) {
  let count = 0;
  const cursor = dateAtNoon(from);
  const end = dateAtNoon(to);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function departmentName(staff: StaffRow) {
  return staff.departments?.name || "Unassigned";
}

function departmentCode(staff: StaffRow) {
  return staff.departments?.code || staff.departments?.name || "Unassigned";
}

function lagosHour(value: string) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return `${hour}:00`;
}

export function buildReportEvidence({
  rows,
  staff,
  from,
  to,
  scope,
  scopeLabel,
}: {
  rows: ReportRow[];
  staff: StaffRow[];
  from: string;
  to: string;
  scope: ReportScope;
  scopeLabel: string;
}) {
  const expectedWorkingDays = workingDays(from, to);
  const expectedAttendanceDays = expectedWorkingDays * staff.length;
  const present = rows.filter((row) => row.status === "present").length;
  const late = rows.filter((row) => row.status === "late").length;
  const excused = rows.filter((row) => row.status === "excused").length;
  const attended = rows.filter((row) => Boolean(row.sign_in_at)).length;
  const totalHours = rows.reduce((sum, row) => sum + Number(row.hours_worked || 0), 0);
  const earlyDepartures = rows.filter((row) => row.early_departure).length;
  const incompleteSignOuts = rows.filter((row) => row.sign_in_at && !row.sign_out_at).length;
  const manualEntries = rows.filter((row) => row.marked_by_admin).length;

  const summary = {
    headcount: staff.length,
    expectedWorkingDays,
    expectedAttendanceDays,
    attendedDays: attended,
    presentOnTimeDays: present,
    lateDays: late,
    excusedDays: excused,
    inferredAbsentDays: Math.max(0, expectedAttendanceDays - attended - excused),
    attendanceRatePercent: expectedAttendanceDays ? Math.round((attended / expectedAttendanceDays) * 100) : 0,
    punctualityPercent: attended ? Math.round((present / attended) * 100) : 0,
    totalHours: round(totalHours),
    averageHoursPerAttendedDay: attended ? round(totalHours / attended, 2) : 0,
    earlyDepartures,
    incompleteSignOuts,
    manualEntries,
  };

  const dailyMap = new Map<string, { date: string; onTime: number; late: number; excused: number; hours: number }>();
  rows.forEach((row) => {
    const day = dailyMap.get(row.work_date) || { date: row.work_date, onTime: 0, late: 0, excused: 0, hours: 0 };
    if (row.status === "present") day.onTime += 1;
    if (row.status === "late") day.late += 1;
    if (row.status === "excused") day.excused += 1;
    day.hours += Number(row.hours_worked || 0);
    dailyMap.set(row.work_date, day);
  });

  const daily = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ ...day, hours: round(day.hours) }));

  const arrivalMap = new Map<string, number>();
  rows.forEach((row) => {
    if (!row.sign_in_at) return;
    const hour = lagosHour(row.sign_in_at);
    arrivalMap.set(hour, (arrivalMap.get(hour) || 0) + 1);
  });
  const arrivals = [...arrivalMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour, count }));

  const departmentMap = new Map<string, {
    department: string;
    code: string;
    headcount: number;
    attended: number;
    late: number;
    excused: number;
    hours: number;
  }>();

  staff.forEach((person) => {
    const key = person.department_id || "unassigned";
    const current = departmentMap.get(key) || {
      department: departmentName(person),
      code: departmentCode(person),
      headcount: 0,
      attended: 0,
      late: 0,
      excused: 0,
      hours: 0,
    };
    current.headcount += 1;
    departmentMap.set(key, current);
  });

  const staffById = new Map(staff.map((person) => [person.id, person]));
  rows.forEach((row) => {
    const person = staffById.get(row.user_id);
    if (!person) return;
    const key = person.department_id || "unassigned";
    const current = departmentMap.get(key);
    if (!current) return;
    if (row.sign_in_at) current.attended += 1;
    if (row.status === "late") current.late += 1;
    if (row.status === "excused") current.excused += 1;
    current.hours += Number(row.hours_worked || 0);
  });

  const departments = [...departmentMap.values()]
    .map((department) => ({
      ...department,
      hours: round(department.hours),
      attendanceRatePercent: department.headcount * expectedWorkingDays
        ? Math.round((department.attended / (department.headcount * expectedWorkingDays)) * 100)
        : 0,
      punctualityPercent: department.attended
        ? Math.round(((department.attended - department.late) / department.attended) * 100)
        : 0,
    }))
    .sort((a, b) => b.attendanceRatePercent - a.attendanceRatePercent);

  const rowsByPerson = new Map<string, ReportRow[]>();
  rows.forEach((row) => {
    const personRows = rowsByPerson.get(row.user_id) || [];
    personRows.push(row);
    rowsByPerson.set(row.user_id, personRows);
  });
  const people = staff.map((selected) => {
    const personRows = rowsByPerson.get(selected.id) || [];
    const personAttended = personRows.filter((row) => Boolean(row.sign_in_at)).length;
    const personLate = personRows.filter((row) => row.status === "late").length;
    const personExcused = personRows.filter((row) => row.status === "excused").length;
    const personHours = personRows.reduce((sum, row) => sum + Number(row.hours_worked || 0), 0);
    return {
      id: selected.id,
      name: selected.full_name,
      staffNumber: selected.staff_id || null,
      department: departmentName(selected),
      departmentCode: departmentCode(selected),
      attendedDays: personAttended,
      expectedDays: expectedWorkingDays,
      attendanceRatePercent: expectedWorkingDays
        ? Math.round((personAttended / expectedWorkingDays) * 100)
        : 0,
      lateDays: personLate,
      excusedDays: personExcused,
      earlyDepartures: personRows.filter((row) => row.early_departure).length,
      incompleteSignOuts: personRows.filter((row) => row.sign_in_at && !row.sign_out_at).length,
      totalHours: round(personHours),
    };
  }).sort((a, b) => b.attendanceRatePercent - a.attendanceRatePercent || a.name.localeCompare(b.name));

  const person = scope === "individual" || scope === "self"
    ? (() => {
        const selected = staff[0];
        if (!selected) return null;
        return {
          name: selected.full_name,
          staffNumber: selected.staff_id || null,
          department: departmentName(selected),
        };
      })()
    : null;

  return {
    period: { from, to },
    scope: { kind: scope, label: scopeLabel },
    summary,
    daily,
    arrivals,
    departments,
    people,
    person,
    methodology: {
      expectedDays: "Monday to Friday, inclusive",
      publicHolidaysDeducted: false,
      incompleteSignOutHoursCounted: false,
      note: "Public holidays are not currently deducted, so absence and rate figures require administrative context before formal use.",
    },
  };
}
