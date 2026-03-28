# Station Allotment System: Comprehensive Administration Manual

---

## 1. System Overview & Architecture

The **Station Allotment System** is a robust, real-time web application engineered to manage the merit-based allocation of students to individual schools/colleges (stations) across various districts. The system handles granular complexity including overlapping academic sessions, shifting seat matrices, multi-tiered district administration, and real-time live-projected algorithm executions.

### Technology Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- **State Management**: React Query (Server State), React Hook Form.
- **Backend Framework**: Node.js with Express.js.
- **Database Engine**: PostgreSQL (Neon Serverless) governed by Drizzle ORM.
- **Security**: Strict Role-Based Access Control (RBAC) separating `central_admin` and `district_admin`.

---

## 2. Directory of Modules and Pages

The application is structured into discrete functional modules accessed via the centralized sidebar:

- **Dashboard (`/`)**: High-level statistical overview of current rounds, total seats, allotted vs. pending students, and district participation metrics.
- **Year Sessions (`/sessions`)**: Infrastructure layer defining dynamic operational date ranges for academic years.
- **Counseling Mgmt (`/counseling`)**: The command center for creating broad titles and spawning iterative allocation rounds (Round 1 → Round 2).
- **Vacancies (`/vacancies`)**: Database of every available seat categorized specifically by School (UDISE), Stream, Gender, and strict Category reservations (Open, WHH, Private, Disabled).
- **Students & Choices (`/students`)**: Master ledger of candidate merits, their respective District, and their 1-10 preference choices.
- **District Admins (`/district-admins`)**: User management allowing Central to provision accounts for individual districts.
- **District Analysis (`/district-analysis`)**: Telemetry allowing Central to monitor how many students in each district are waiting vs. processed.
- **Allocation Engine (`/allocation`)**: The administrative execution layer where the merit-based matching algorithm is monitored and triggered.
- **Projector View (`/display`)**: A public-facing UI specifically built for large auditoriums, providing full transparency by rendering the engine’s choices live.
- **Reports & Export (`/export`)**: Documentation hub for extracting finalized XLSX/PDF seat allotment results and cutoff statistics.

---

## 3. Central Administration Workflow: Step-by-Step

To utilize the application successfully, a Central Administrator must follow three strict operational phases.

### Phase 1: Initialization (Pre-Process Setup)
*These steps must be completed before any district admin can begin interacting with students.*

1. **Define the Date Window**: 
   - Navigate to **Year Sessions**.
   - Create the specific variant for the season (e.g., Session `2026-2027` running from April 1 to April 10).
   
2. **Initialize the Program**: 
   - Navigate to **Counseling Mgmt**.
   - Click **Create Title** (e.g., `Phase 1 Regular Allotment`), binding it to the session.
   - The system automatically provisions `"Round 1"` in an inactive state.
   
3. **Upload the Seat Matrix**: 
   - Navigate to **Vacancies**.
   - Import the verified CSV detailing exactly how many seats exist at each School/Category tuple.
   
4. **Import Candidate Roster**: 
   - Navigate to **Students**.
   - Upload the absolute Merit List. Ensure everyone has an immutable `meritNumber` derived from entrance results.
   
5. **Provision District Access**: 
   - Navigate to **District Admins**.
   - Create secure login credentials for every participating center so they can process their subset of candidates.

---

### Phase 2: Execution & Transparency (During Process)
*This is the live operational phase handling real-time data entry and algorithmic matching.*

1. **District Hub Processing**: 
   - District Admins log in nationwide. They verify physical candidate documents, confirm eligibility, and input up to **10 school preferences** into the system.
   - Admins exclusively use strict Action Icons (see Section 4).
   
2. **Global Readiness Check**: 
   - Central Admin uses the **District Analysis** page to ensure all centers have finalized data entry. 

3. **Trigger the Match Engine**: 
   - Central Admin navigates to the **Allocation** dashboard. 
   - Once all locks pass, the "Start Allocation" command is executed.
   - *Architecture Note: The engine loads vacancies into a high-speed RAM hash map, processes students strictly ascending by merit, matches choices iteratively 1-10, and deducts seats securely.*

4. **Live Auditorium Projection**: 
   - The Central Administrator projects the **Projector View (`/display`)** page to monitors.
   - Students in the waiting room watch the web socket dynamically render the Allocation Engine's calculations in real-time.

![Live Projector View Display](/Users/charanpreetsingh/.gemini/antigravity/brain/f0ee0548-abca-4db1-b5ad-f16cf7c34675/allocation_projector_light_v4_1773989810314.png)

#### Direct Allocation Override / Modal Interface:
For manual interventions or highly specific edge-cases, the Administration Override Modal allows targeted allocations. These interfaces specifically guardrail choices by enforcing Category matching (Open, Disabled, Private, WHH).

![Allocation Modal Flow](/Users/charanpreetsingh/.gemini/antigravity/brain/f0ee0548-abca-4db1-b5ad-f16cf7c34675/allocation_modal_mockup_1774150081946.png)

---

### Phase 3: Post-Process & Iteration (Finalization)
*These steps wrap up the current block of allotments and prepare for subsequent rounds.*

1. **Locking the Round**: 
   - Central Admin clicks `Finalize Allocation`. This permanently locks the snapshot. No student preferences for Round 1 can be mutated hereafter.
   
2. **Publish formal results**: 
   - Navigate to **Reports & Export**. Extract formal documentation containing allotments and category cutoffs.
   
3. **Physical Admission Validation**: 
   - As students report to their granted stations, Central/District Admins convert their status globally using the ✅ **Admit** icon.
   - If a student rejects their seat, the Admin uses the ❌ **Not Admitted** icon.
   - If a student leaves after admission, the Admin uses the 🚪 **Vacate** icon.
   - *Crucially, any Vacated or Not Admitted seat is dynamically restored to the master Vacancy pool.*

4. **Spawn Subsequent Round**: 
   - If seats remain, the Central Admin returns to **Counseling Mgmt** and clicks `Start Next Round`.
   - The system automatically snapshots the remaining vacancy pool, rolls forward unallotted candidates, and clones the setup for "Round 2".

---

## 4. UI Operations Reference & Icons

To guarantee speed during high-traffic counseling days, student grids utilize a uniform, color-coded icon language:

| Icon | Operation | Context & System Effect | Status Change |
| :---: | :--- | :--- | :--- |
| 🔓 | **Unlock** | Allows District Admins to explicitly re-enter the submission form if a student changes their mind prior to engine execution. | `locked` → `pending` |
| 🔄 | **Reset** | Clears the student's current algorithmic allotment. Used to correct anomalies before the round is finalized. | `allotted` → `pending` |
| 🚪 | **Vacate** | Explicitly drops a seat *after* it was finalized. Immediately cascades the seat back into the active network pool. | `admitted/allotted` → `vacated` |
| ✅ | **Admit** | Validates the physical arrival of the student. Final state locking the seat permanently off the market. | `allotted` → `admitted` |
| ❌ | **Not Admitted** | Flags the candidate as absent/rejected. Immediately releases the allocated seat back to the pool. | `allotted` → `not_allotted` |
| ❓ | **Help/Flow** | Toggles an on-screen flowchart explaining precisely what status is required to see these buttons. | *Informational* |

---
*Official Manual Generated for the Station Allotment Application.*
