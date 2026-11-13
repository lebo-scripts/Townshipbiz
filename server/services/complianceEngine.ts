import type {
  BusinessProfile,
  ComplianceAssessmentItem,
  ComplianceClassification,
  ComplianceRule,
} from '../../shared/types.ts';

export const SA_COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: 'cipc-registration-annual-return',
    area: 'CIPC & Business Registration',
    name: 'CIPC Entity Registration & Annual Returns',
    description:
      'Private companies ((Pty) Ltd), non-profit companies (NPC), and cooperatives must register with CIPC and file annual returns within 30 business days of their registration anniversary.',
    applicableStructures: ['pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'Mandatory for registered companies, cooperatives, and NPCs.',
    exemptions: 'Informal traders and sole proprietors operating under their own name are NOT legally required to register with CIPC.',
    officialSourceName: 'Companies and Intellectual Property Commission (CIPC)',
    officialSourceUrl: 'https://www.cipc.co.za/',
    effectiveDate: '2011-05-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'sars-income-tax',
    area: 'SARS Income Tax',
    name: 'SARS Income Tax & Turnover Tax Assessment',
    description:
      'South African residents and registered entities earning taxable income above annual SARS thresholds must register for income tax (or qualify for Simplified Turnover Tax if annual qualifying turnover is R1 million or less).',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds:
      'Companies ((Pty) Ltd) must register regardless of profit; individuals/sole proprietors must submit returns if income exceeds the annual SARS tax threshold or if conducting trade meeting SARS filing criteria.',
    exemptions: 'Micro-businesses with qualifying turnover <= R1,000,000 may opt into Turnover Tax instead of standard corporate/personal provisional tax.',
    officialSourceName: 'South African Revenue Service (SARS) — Small Businesses',
    officialSourceUrl: 'https://www.sars.gov.za/types-of-tax/small-businesses/',
    effectiveDate: '2009-03-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'sars-vat',
    area: 'Value-Added Tax (VAT)',
    name: 'SARS VAT Registration (15% Standard Rate)',
    description:
      'Businesses making taxable supplies exceeding R1,000,000 in any consecutive 12-month period must register as a VAT vendor and submit VAT201 returns.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds:
      'Compulsory registration when taxable turnover exceeds R1,000,000 in 12 months. Voluntary registration is available if taxable supplies exceed R50,000 in 12 months.',
    exemptions: 'Businesses with taxable turnover under R1,000,000 are exempt from compulsory VAT registration and should not charge VAT unless voluntarily registered.',
    officialSourceName: 'SARS — Value-Added Tax (VAT)',
    officialSourceUrl: 'https://www.sars.gov.za/types-of-tax/value-added-tax/',
    effectiveDate: '1991-09-30',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'sars-paye',
    area: 'PAYE (Employees Tax)',
    name: 'SARS Pay-As-You-Earn (PAYE) Employer Registration',
    description:
      'Employers paying remuneration to employees earning above the statutory income tax threshold must register for PAYE and submit monthly EMP201 declarations.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'Applies when the business employs 1 or more workers whose earnings exceed SARS monthly tax thresholds.',
    exemptions: 'Owner-only businesses with zero employees do not register for PAYE.',
    officialSourceName: 'SARS — Pay-As-You-Earn (PAYE)',
    officialSourceUrl: 'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/',
    effectiveDate: '1962-07-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'uif-contributions',
    area: 'UIF',
    name: 'Unemployment Insurance Fund (UIF) Registration',
    description:
      'Employers must register employees who work more than 24 hours per month with the UIF and contribute 2% of remuneration (1% employer, 1% employee).',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'Mandatory whenever 1 or more staff members work more than 24 hours per month.',
    exemptions: 'Sole operators with zero employees and workers working <= 24 hours per month are exempt.',
    officialSourceName: 'Department of Employment and Labour — UIF',
    officialSourceUrl: 'https://www.labour.gov.za/',
    effectiveDate: '2002-04-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'coida-compensation',
    area: 'COIDA',
    name: 'Compensation Fund (COIDA) Registration & Return of Earnings',
    description:
      'Any employer with one or more full-time or part-time employees must register with the Compensation Fund and submit an annual Return of Earnings (ROE).',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'Applies from the first employee hired (full-time, part-time, or casual).',
    exemptions: 'Sole proprietors with zero employees are exempt unless they hire staff.',
    officialSourceName: 'Department of Employment and Labour — Compensation Fund',
    officialSourceUrl: 'https://cfonline.labour.gov.za/',
    effectiveDate: '1993-09-24',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'bcea-employment-particulars',
    area: 'Employment Requirements',
    name: 'BCEA Written Particulars of Employment & Wage Compliance',
    description:
      'Under the Basic Conditions of Employment Act and National Minimum Wage Act, employers must provide written employment particulars, payslips, and meet statutory minimum wages.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'Applies whenever employing 1 or more staff.',
    exemptions: 'Businesses with no employees have no employment contract obligations.',
    officialSourceName: 'Department of Employment and Labour — BCEA',
    officialSourceUrl: 'https://www.labour.gov.za/DocumentCenter/Acts/Basic%20Conditions%20of%20Employment/',
    effectiveDate: '1998-12-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'ohs-workplace-safety',
    area: 'Occupational Health & Safety',
    name: 'Occupational Health and Safety Act (OHS) Duties',
    description:
      'Businesses must maintain a safe working environment, basic first aid kit, fire safety readiness, and report serious workplace incidents.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'General duty applies to all workplaces; written Health & Safety Committee rules tighten at 20+ employees.',
    exemptions: 'Low-risk solo home freelancers have minimal compliance overhead compared to physical workshops or retail shops.',
    officialSourceName: 'Department of Employment and Labour — OHS',
    officialSourceUrl: 'https://www.labour.gov.za/',
    effectiveDate: '1994-01-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'municipal-trading-permit',
    area: 'Municipal Trading Requirements',
    name: 'Municipal Informal Trading Permit / Business Licence',
    description:
      'Street traders, spaza shops, salons, and food outlets require municipal trading permits or Businesses Act Schedule 1 licences from their local municipality (e.g. City of Johannesburg, City of Cape Town, eThekwini, City of Tshwane).',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: [
      'Spaza & Grocery Retail',
      'Food Vendor & Restaurant',
      'Hair Salon & Barber',
      'General Retail',
      'Trades & Maintenance',
    ],
    applicableLocations: ['Local Municipality (By-Law Dependent)'],
    conditionsAndThresholds: 'Required for street trading, food/health-related premises, and physical retail storefronts under municipal by-laws.',
    exemptions: 'Purely online/remote freelancers generally do not require a street trading permit (check home-office zoning rules instead).',
    officialSourceName: 'South African Local Government Association (SALGA) / Local Municipality',
    officialSourceUrl: 'https://www.gov.za/services/services-residents/business/starting-business',
    effectiveDate: '1991-06-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'requires_local_check',
  },
  {
    id: 'municipal-zoning-land-use',
    area: 'Zoning & Land-Use Rules',
    name: 'Municipal Zoning & Home-Based Business Consent',
    description:
      'Operating a spaza shop, workshop, salon, or kitchen from a residential township erf requires confirming residential/business zoning or obtaining municipal consent-use approval under SPLUMA and local land-use schemes.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: [
      'Spaza & Grocery Retail',
      'Food Vendor & Restaurant',
      'Hair Salon & Barber',
      'General Retail',
      'Trades & Maintenance',
      'Clothing & Tailoring',
    ],
    applicableLocations: ['Local Municipality Town Planning'],
    conditionsAndThresholds: 'Required for physical trading on residential erven or commercial premises.',
    exemptions: 'Mobile-only traders or low-impact administrative home offices often qualify under home-enterprise rules depending on municipal by-laws.',
    officialSourceName: 'Department of Agriculture, Land Reform and Rural Development (SPLUMA)',
    officialSourceUrl: 'https://www.gov.za/documents/spatial-planning-and-land-use-management-act',
    effectiveDate: '2015-07-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'requires_local_check',
  },
  {
    id: 'r638-food-premises-coa',
    area: 'Food Premises Requirements',
    name: 'Certificate of Acceptability (R638) for Food Premises',
    description:
      'Any spaza shop, kota kitchen, shisanyama, bakery, or food trader handling, storing, or preparing food must hold a valid Certificate of Acceptability issued by the Municipal Environmental Health Practitioner.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['Spaza & Grocery Retail', 'Food Vendor & Restaurant', 'Agriculture & Fresh Produce'],
    applicableLocations: ['District / Metropolitan Municipality Health Department'],
    conditionsAndThresholds: 'Mandatory before handling or selling food products to the public, regardless of business size.',
    exemptions: 'Non-food businesses (salons, tailors, tech, transport) are exempt.',
    officialSourceName: 'National Department of Health — Regulations R638',
    officialSourceUrl: 'https://www.health.gov.za/',
    effectiveDate: '2018-06-22',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'popia-data-protection',
    area: 'POPIA',
    name: 'POPIA Customer & Employee Data Compliance',
    description:
      'Under the Protection of Personal Information Act (POPIA), businesses collecting customer phone numbers, ID numbers, or employee records must collect only necessary data, secure it, and register an Information Officer with the Information Regulator.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['All'],
    applicableLocations: ['National (South Africa)'],
    conditionsAndThresholds: 'Applies to every responsible party processing personal information in South Africa.',
    exemptions: 'Purely personal/household activity is exempt, but business customer/supplier records fall under POPIA.',
    officialSourceName: 'Information Regulator (South Africa)',
    officialSourceUrl: 'https://inforegulator.org.za/',
    effectiveDate: '2021-07-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'verified',
  },
  {
    id: 'industry-specific-permits',
    area: 'Industry-Specific Permits',
    name: 'Sectoral Licences (Transport, Health Hygiene, or Liquor)',
    description:
      'Certain industries require extra licences: operating licences for passenger/freight transport, municipal health certificates for hair/beauty salons, or provincial liquor licences if selling alcohol.',
    applicableStructures: ['informal', 'sole_proprietor', 'pty_ltd', 'cooperative', 'npo'],
    applicableIndustries: ['Food Vendor & Restaurant', 'Hair Salon & Barber', 'Transport & Delivery', 'Agriculture & Fresh Produce'],
    applicableLocations: ['Provincial / Municipal Authorities'],
    conditionsAndThresholds: 'Applies only if your specific operations involve regulated activities (alcohol, commercial transport, personal care).',
    exemptions: 'General dry-goods retailers or non-regulated service providers do not need sectoral liquor or transport permits.',
    officialSourceName: 'South African Government Services — Business Licences',
    officialSourceUrl: 'https://www.gov.za/services/services-residents/business',
    effectiveDate: '2004-01-01',
    lastVerifiedDate: '2026-03-01',
    reviewStatus: 'requires_local_check',
  },
];

function turnoverExceedsOneMillion(range: string): boolean {
  const normalized = range.toLowerCase();
  return (
    normalized.includes('1m') ||
    normalized.includes('1,000,000') ||
    normalized.includes('1 000 000') ||
    normalized.includes('2m') ||
    normalized.includes('5m') ||
    normalized.includes('10m') ||
    normalized.includes('above r1')
  );
}

function turnoverUnderFiftyThousand(range: string): boolean {
  const normalized = range.toLowerCase();
  return normalized.includes('under r50') || normalized.includes('0 - r50') || normalized.includes('below r50');
}

export function assessBusinessCompliance(
  business: Pick<
    BusinessProfile,
    'structure' | 'industry' | 'employeeCount' | 'annualTurnoverRange' | 'vatRegistered' | 'province' | 'municipality' | 'location'
  >,
  savedMap: Record<
    string,
    { status: 'pending' | 'in_progress' | 'completed' | 'not_applicable'; linkedDocumentId?: string; renewalDate?: string; notes?: string }
  > = {}
): ComplianceAssessmentItem[] {
  const hasEmployees = business.employeeCount > 0;
  const highTurnover = turnoverExceedsOneMillion(business.annualTurnoverRange);
  const verySmallTurnover = turnoverUnderFiftyThousand(business.annualTurnoverRange);
  const isRegisteredEntity =
    business.structure === 'pty_ltd' || business.structure === 'cooperative' || business.structure === 'npo';
  const isFoodBusiness =
    business.industry === 'Spaza & Grocery Retail' ||
    business.industry === 'Food Vendor & Restaurant' ||
    business.industry === 'Agriculture & Fresh Produce';
  const isPhysicalTrade =
    business.industry === 'Spaza & Grocery Retail' ||
    business.industry === 'Food Vendor & Restaurant' ||
    business.industry === 'Hair Salon & Barber' ||
    business.industry === 'General Retail' ||
    business.industry === 'Trades & Maintenance' ||
    business.industry === 'Clothing & Tailoring';
  const isSectorPermitted =
    business.industry === 'Food Vendor & Restaurant' ||
    business.industry === 'Hair Salon & Barber' ||
    business.industry === 'Transport & Delivery' ||
    business.industry === 'Agriculture & Fresh Produce';

  return SA_COMPLIANCE_RULES.map((rule) => {
    let classification: ComplianceClassification = 'conditional';
    let reason = '';
    let uncertaintyNote: string | undefined;

    switch (rule.id) {
      case 'cipc-registration-annual-return':
        if (isRegisteredEntity) {
          classification = 'mandatory';
          reason = `Your business is structured as ${business.structure.replace('_', ' ')}, so CIPC registration and annual returns apply.`;
        } else {
          classification = 'not_applicable';
          reason = `As an ${business.structure === 'informal' ? 'informal trader' : 'sole proprietor'}, CIPC registration is not legally required, though you may register voluntarily to open corporate bank accounts or tender.`;
        }
        break;

      case 'sars-income-tax':
        if (isRegisteredEntity || highTurnover) {
          classification = 'mandatory';
          reason = isRegisteredEntity
            ? 'All registered companies, cooperatives, and NPCs must register for SARS income tax.'
            : 'Your estimated turnover range requires formal SARS income tax or Turnover Tax assessment.';
        } else {
          classification = 'conditional';
          reason =
            'Sole proprietors and informal traders only pay income tax above SARS annual personal thresholds, and may qualify for Simplified Turnover Tax (R1M or less).';
          uncertaintyNote = 'Confirm your exact net profit against the current SARS annual individual tax threshold.';
        }
        break;

      case 'sars-vat':
        if (business.vatRegistered || highTurnover) {
          classification = 'mandatory';
          reason = business.vatRegistered
            ? 'Your profile indicates you are VAT registered, so VAT201 returns and tax invoices are mandatory.'
            : 'Annual taxable supplies exceeding R1,000,000 require compulsory SARS VAT registration.';
        } else if (verySmallTurnover) {
          classification = 'not_applicable';
          reason = 'Your turnover range is below R50,000, so VAT registration is not required and you do not charge VAT.';
        } else {
          classification = 'not_applicable';
          reason =
            'VAT registration is only compulsory above R1,000,000 annual turnover (voluntary registration is possible above R50,000).';
        }
        break;

      case 'sars-paye':
      case 'uif-contributions':
      case 'coida-compensation':
      case 'bcea-employment-particulars':
        if (hasEmployees) {
          classification = rule.id === 'sars-paye' ? 'conditional' : 'mandatory';
          reason =
            rule.id === 'sars-paye'
              ? `You reported ${business.employeeCount} employee(s). PAYE applies if any worker earns above the SARS monthly tax threshold.`
              : `You reported ${business.employeeCount} employee(s), triggering statutory employer obligations.`;
        } else {
          classification = 'not_applicable';
          reason = 'Your business currently has 0 employees, so employer obligations do not apply.';
        }
        break;

      case 'ohs-workplace-safety':
        classification = isPhysicalTrade || hasEmployees ? 'mandatory' : 'recommended';
        reason =
          isPhysicalTrade || hasEmployees
            ? 'Physical trading spaces and workplaces with staff must maintain basic health, fire, and first-aid safety.'
            : 'Recommended baseline safety practices for your workspace.';
        break;

      case 'municipal-trading-permit':
        if (isPhysicalTrade) {
          classification = 'mandatory';
          reason = `${business.industry} businesses operating stalls, spaza shops, salons, or physical premises require a municipal trading permit or business licence in ${business.municipality || business.location} (${business.province}).`;
          uncertaintyNote = `By-law fee schedules and stall demarcations vary by municipality (${business.municipality || business.province}). Verify directly with your local Economic Development / Licensing office.`;
        } else {
          classification = 'not_applicable';
          reason = `${business.industry} without street trading or food/health storefronts generally does not need a municipal street trading permit.`;
        }
        break;

      case 'municipal-zoning-land-use':
        if (isPhysicalTrade) {
          classification = 'requires_professional_review';
          reason = `Operating a ${business.industry} business from a township or residential stand in ${business.municipality || business.location} depends on municipal land-use scheme consent.`;
          uncertaintyNote = 'Check with your local Municipal Town Planning department whether consent use is required for your specific erf.';
        } else {
          classification = 'recommended';
          reason = 'Home-office work is generally permitted if there is no customer foot traffic or signage, subject to municipal rules.';
        }
        break;

      case 'r638-food-premises-coa':
        if (isFoodBusiness) {
          classification = 'mandatory';
          reason = `${business.industry} handles or sells food, requiring a Certificate of Acceptability (R638) from Environmental Health.`;
        } else {
          classification = 'not_applicable';
          reason = `Not applicable because ${business.industry} is not classified as a food premises operation.`;
        }
        break;

      case 'popia-data-protection':
        classification = 'mandatory';
        reason = 'Applies to all businesses storing customer contacts, invoices, or employee personal details in South Africa.';
        break;

      case 'industry-specific-permits':
        if (isSectorPermitted) {
          classification = 'requires_professional_review';
          reason = `${business.industry} often has activity-specific rules (e.g. salon hygiene by-laws, transport operating licences, or liquor licences if alcohol is sold).`;
          uncertaintyNote = 'Exact permits depend on your specific activities—do not assume an exemption without checking your local municipality.';
        } else {
          classification = 'not_applicable';
          reason = 'No specialised sectoral licence identified for your general industry profile.';
        }
        break;

      default:
        classification = 'requires_professional_review';
        reason = 'Review with a qualified South African accountant or municipal licensing officer.';
    }

    const saved = savedMap[rule.id];
    return {
      rule,
      classification,
      reason,
      uncertaintyNote,
      savedStatus: saved?.status || (classification === 'not_applicable' ? 'not_applicable' : 'pending'),
      linkedDocumentId: saved?.linkedDocumentId,
      renewalDate: saved?.renewalDate,
      notes: saved?.notes,
    };
  });
}
