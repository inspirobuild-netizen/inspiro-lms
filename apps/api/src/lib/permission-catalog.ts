// Pure, dependency-free permission catalog + default staff-role definitions.
// Imported by both the runtime resolver (permissions.ts) and the standalone
// seed script (drizzle/seed-rbac.ts) — must have NO db/redis imports.

export interface PermissionDef {
  code: string;
  label: string;
  category: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  { code: 'dashboard.view', label: 'View dashboard', category: 'General' },

  // Staff & org
  { code: 'staff.view', label: 'View staff', category: 'Staff' },
  { code: 'staff.manage', label: 'Create / edit / disable staff', category: 'Staff' },
  { code: 'roles.manage', label: 'Manage roles & permissions', category: 'Staff' },
  { code: 'branches.manage', label: 'Manage branches', category: 'Staff' },

  // Students
  { code: 'students.view', label: 'View students', category: 'Students' },
  { code: 'students.manage', label: 'Create / edit students', category: 'Students' },
  { code: 'students.verify', label: 'Approve / reject student verification', category: 'Students' },

  // Leads / CRM
  { code: 'leads.view', label: 'View own leads', category: 'Admissions CRM' },
  { code: 'leads.view_all', label: 'View all / branch leads', category: 'Admissions CRM' },
  { code: 'leads.manage', label: 'Create / edit leads & follow-ups', category: 'Admissions CRM' },
  { code: 'admissions.view', label: 'View own admissions', category: 'Admissions CRM' },
  { code: 'admissions.view_all', label: 'View all / branch admissions', category: 'Admissions CRM' },
  { code: 'admissions.manage', label: 'Convert leads & manage admissions', category: 'Admissions CRM' },

  // Academics
  { code: 'batches.view', label: 'View batches', category: 'Academics' },
  { code: 'batches.manage', label: 'Manage batches & enrolment', category: 'Academics' },
  { code: 'courses.view', label: 'View courses', category: 'Academics' },
  { code: 'courses.manage', label: 'Manage courses & content', category: 'Academics' },
  { code: 'exams.view', label: 'View exams', category: 'Academics' },
  { code: 'exams.manage', label: 'Manage exams & questions', category: 'Academics' },
  { code: 'doubts.view', label: 'View doubts', category: 'Academics' },
  { code: 'doubts.manage', label: 'Answer, assign & resolve doubts', category: 'Academics' },
  { code: 'mentors.view', label: 'View mentor / instructor workload', category: 'Academics' },
  { code: 'content.manage', label: 'Curate current-affairs & AI content', category: 'Academics' },

  // Insights
  { code: 'analytics.view', label: 'View own analytics', category: 'Insights' },
  { code: 'analytics.view_all', label: 'View full analytics', category: 'Insights' },
  { code: 'leaderboard.view', label: 'View leaderboard analytics', category: 'Insights' },
  { code: 'revenue.view', label: 'View revenue', category: 'Insights' },
  { code: 'reports.view', label: 'Generate reports', category: 'Insights' },
  { code: 'audit.view', label: 'View audit log', category: 'Insights' },
];

export const PERMISSION_CODES = PERMISSION_CATALOG.map((p) => p.code);

// Default staff roles seeded on first run. Admin can add/edit roles + perms after.
export interface DefaultRole {
  name: string;
  slug: string;
  description: string;
  permissions: string[];
}

export const DEFAULT_STAFF_ROLES: DefaultRole[] = [
  {
    name: 'Admission Counsellor',
    slug: 'admission-counsellor',
    description: 'Owns leads, follow-ups and admissions for their own pipeline — no visibility into other counsellors\' students, leads, or org-wide data.',
    permissions: [
      'dashboard.view', 'leads.view', 'leads.manage', 'admissions.view', 'admissions.manage', 'batches.view',
    ],
  },
  {
    name: 'Centre Head',
    slug: 'centre-head',
    description: 'Branch oversight: all leads/admissions, staff, academics, revenue & reports.',
    permissions: [
      'dashboard.view', 'staff.view', 'leads.view_all', 'leads.manage', 'admissions.view_all',
      'admissions.manage', 'students.view', 'students.verify', 'batches.view', 'courses.view',
      'exams.view', 'mentors.view', 'leaderboard.view', 'analytics.view_all', 'revenue.view', 'reports.view',
    ],
  },
  {
    name: 'Teacher',
    slug: 'teacher',
    description: 'Teaching staff: their batches, students, attendance, exams and live classes.',
    permissions: ['dashboard.view', 'batches.view', 'students.view', 'exams.view', 'doubts.view', 'doubts.manage'],
  },
  {
    name: 'Academic Coordinator',
    slug: 'academic-coordinator',
    description: 'Coordinates courses, batches, exams, doubts, mentors and content across the academy.',
    permissions: [
      'dashboard.view', 'batches.view', 'batches.manage', 'courses.view', 'courses.manage',
      'exams.view', 'exams.manage', 'doubts.view', 'doubts.manage', 'mentors.view',
      'leaderboard.view', 'content.manage', 'students.view', 'analytics.view',
    ],
  },
  {
    name: 'Office Staff',
    slug: 'office-staff',
    description: 'Front-desk / administrative support.',
    permissions: ['dashboard.view', 'students.view', 'leads.view', 'batches.view'],
  },
  {
    name: 'Finance Staff',
    slug: 'finance-staff',
    description: 'Fees, payments and revenue reporting.',
    permissions: ['dashboard.view', 'admissions.view_all', 'revenue.view', 'reports.view', 'students.view'],
  },
  {
    name: 'Marketing Executive',
    slug: 'marketing-executive',
    description: 'Lead generation and campaign source analytics.',
    permissions: ['dashboard.view', 'leads.view_all', 'leads.manage', 'analytics.view'],
  },
  {
    name: 'Branch Manager',
    slug: 'branch-manager',
    description: 'Full branch management across staff, admissions, academics and reports.',
    permissions: [
      'dashboard.view', 'staff.view', 'staff.manage', 'branches.manage', 'leads.view_all', 'leads.manage',
      'admissions.view_all', 'admissions.manage', 'students.view', 'students.manage', 'students.verify',
      'batches.view', 'batches.manage', 'courses.view', 'exams.view', 'mentors.view', 'leaderboard.view',
      'analytics.view_all', 'revenue.view', 'reports.view', 'audit.view',
    ],
  },
];
