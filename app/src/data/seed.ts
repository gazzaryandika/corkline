import type { BoardDocument, CardBoardNode, EdgeKindId, GroupBoardNode, NodeTypeId, ProjectBrief } from '../types';

function card(
  id: string,
  nodeType: NodeTypeId,
  x: number,
  y: number,
  title: string,
  body: string,
  parentId?: string,
): CardBoardNode {
  const node: CardBoardNode = { id, type: 'card', position: { x, y }, data: { nodeType, title, body } };
  if (parentId) node.parentId = parentId;
  return node;
}

function group(id: string, x: number, y: number, width: number, height: number, label: string): GroupBoardNode {
  return { id, type: 'group', position: { x, y }, width, height, data: { label } };
}

function relation(
  id: string,
  source: string,
  target: string,
  kind: EdgeKindId,
): BoardDocument['edges'][number] {
  return { id, type: 'relation', source, target, data: { kind } };
}

/** Project brief for the seed board, summarised from the cards below. */
export const SEED_BRIEF: ProjectBrief = {
  name: 'Triodos Kids',
  description:
    'A Triodos Bank challenge: as digital payments replace cash, children aged 6–12 get fewer chances to see and handle money, and their engagement with their bank account drops as they grow older. ' +
    "We reframed the question from \"how can children better understand money in a digital world?\" to \"how might we make money's real-world impact visible, tangible and meaningful for families?\" " +
    'The resulting concept, Triodos Kids, combines a personalised kids bank card and an NFC "Trido" keychain, a child-facing app with Save / Spend / Give jars, and a TV-cast family review, so that learning about money becomes a shared parent–child experience rather than a standalone ed-tech tool.',
  users:
    'Children aged 6–12, who learn by doing and understand physical money but not digital money. ' +
    'Their parents, who see financial education as their job but feel under-equipped to act on it day to day. ' +
    'Teachers are secondary stakeholders: they support initiatives like Week van het Geld but do not see structured financial literacy as their responsibility.',
  context:
    'Client: Triodos Bank, a sustainability-focused bank with no kids product yet. Competitors such as GoHenry, Gimi and Greenlight are strong on kids education but weak on sustainability, so nobody serves both. ' +
    'Course: TU Delft IDEM3210, "Designing Financial Futures for the Next Generation", Group 12. Setting: the Netherlands.',
  stage:
    'Concept selected and validated through four sprints (Sprint 2 feasibility, Sprint 3 assumption validation, Sprint 4 desirability testing). Roadmap Horizons 2 and 3 are planned but not yet evidence-tested.',
  notes:
    'Research base: 4 child interviews, 3 parent interviews, 5 teacher interviews, a Reddit analysis of 121 threads, a competitor scan, a parenting-trends survey, and sprint tests with 4 children and 4 parent–child pairs. Samples are small, so flag claims that rest on one source. ' +
    'Known gaps: Web NFC does not work on iOS, and Horizons 2–3 have no evidence yet (their gap flags are intentional). ' +
    'Most useful feedback: where the evidence trail from research to the final concept is weak, untested, or contradicted.',
};

/**
 * Seed board: the actual reasoning trail behind Triodos Kids (Group 12, IDEM3210,
 * "Designing Financial Futures for the Next Generation"), traced from the original
 * brief through to the final concept. Positions run roughly left-to-right in the
 * order the project actually unfolded — initial field research, the insights drawn
 * from it, the strategic reframe, then the four-sprint validation loop that turned
 * the selected concept into Triodos Kids.
 *
 * Horizon 2 and Horizon 3 (the roadmap's later phases) are deliberately left with no
 * incoming edges: the report itself frames them as planned, not yet evidence-tested —
 * so the amber gap flag on them is accurate, not staged.
 */
export function seedBoard(): BoardDocument {
  return {
    version: 1,
    brief: { ...SEED_BRIEF },
    nodes: [
      // Groups must precede their members in this array — React Flow's rule for parent/child nodes.
      group('g-sprint2', 2156, 256, 328, 578, 'Sprint 2 — Feasibility'),
      group('g-sprint3', 2576, 256, 328, 838, 'Sprint 3 — Assumption Validation'),
      group('g-sprint4', 2996, 416, 328, 698, 'Sprint 4 — Desirability Testing'),

      card(
        'p1',
        'problem',
        40,
        600,
        `Cash is disappearing — kids 6–12 need to grasp money's value`,
        `Triodos Bank challenge: as digital payments replace cash, children get fewer chances to see and handle money. Internal data: accounts open young, engagement drops as kids grow older.`,
      ),

      card(
        'e1',
        'evidence',
        440,
        40,
        `Child: "I just give cash to my mom"`,
        `"If I want to buy something online, I just give cash to my mom and then she orders it for me." — one of 4 child interviews, ages 6–12.`,
      ),
      card(
        'e2',
        'evidence',
        440,
        180,
        'Learning through experience, not instruction',
        'Interviewed children engaged with money mainly through participation — pocket money, saving for a goal — not through abstract explanation.',
      ),
      card(
        'e3',
        'evidence',
        440,
        320,
        'Pride of ownership',
        'Children treated earned or saved money differently from money just handed to them — ownership made spending decisions feel more meaningful.',
      ),
      card(
        'e4',
        'evidence',
        440,
        460,
        'Parents: responsible but unsupported',
        'All 3 interviewed parents saw financial education as their job, but felt uncertain how to act on it day-to-day — money talk happened spontaneously, not by plan.',
      ),
      card(
        'e5',
        'evidence',
        440,
        600,
        `Financial literacy isn't in the curriculum`,
        `5 teacher interviews: schools support initiatives like 'Week van het Geld', but don't see structured financial literacy as their own responsibility.`,
      ),
      card(
        'e6',
        'evidence',
        440,
        740,
        'Reddit analysis, 121 threads',
        'Apify scrape + Claude-assisted clustering: parents still lean on cash to teach value, and worry kids can’t count, spend or plan once it’s gone.',
      ),
      card(
        'e7',
        'evidence',
        440,
        880,
        `Competitor gap: no one owns this space`,
        `GoHenry, Gimi, Greenlight: strong kids-education, weak sustainability. Triodos, ASN: strong sustainability, no kids product. Nobody serves both.`,
      ),
      card(
        'e8',
        'evidence',
        440,
        1020,
        `45% of parents: eco-conscious parenting is a top trend`,
        `Family Friendly Working (2025) parenting-trends survey — values-driven parenting is rising, but rarely reaches how parents teach kids about money.`,
      ),

      card(
        'i1',
        'insight',
        900,
        40,
        'Physical money is understood; digital money is invisible',
        'Kids grasp coins and notes but have no mental model for digital transactions — parents currently patch the gap by acting as intermediaries.',
      ),
      card(
        'i2',
        'insight',
        900,
        220,
        'Children learn by doing, not by being told',
        'From the first interviews through to sprint testing: money only became meaningful once tied to a real, physical, personal experience.',
      ),
      card(
        'i3',
        'insight',
        900,
        480,
        'Parents are willing but under-equipped',
        `Parents already feel this is their job — the gap isn't motivation, it's the lack of a natural, low-effort tool for everyday money moments.`,
      ),
      card(
        'i4',
        'insight',
        900,
        700,
        'Ownership and personalisation drive engagement',
        'Children engage differently with money — and tools — that feel like their own, not something handed to them.',
      ),
      card(
        'i5',
        'insight',
        900,
        900,
        'A sustainability + kids-banking gap is wide open',
        'No major bank combines strong kids’ financial education with real sustainability credentials — and family values are shifting toward exactly that.',
      ),

      card(
        'o1',
        'opportunity',
        1360,
        480,
        `HMW make money's real-world impact visible, tangible and meaningful for families?`,
        `The strategic reframe, replacing "how can children better understand money in a digital world?" Children don't need a lesson, they need a moment they can experience.`,
      ),

      card(
        'd1',
        'direction',
        1780,
        480,
        'Selected: Kids Pocket Card App',
        'Scored against Visibility / Meaning / Connection against 3 other concepts (podcast + newspaper, second-hand marketplace, sustainability festival) — the only one to satisfy all three; confirmed with Triodos.',
      ),

      card(
        'pr1',
        'prototype',
        44,
        44,
        'Sprint 2: feasibility prototype',
        'Iterated Claude Design → Loveable → Visily → Claude Code into an interactive build; tested NFC read, TV-casting the dashboard, and a first card + keychain.',
        'g-sprint2',
      ),
      card(
        'a5',
        'assumption',
        44,
        224,
        'NFC integrates without new infrastructure',
        'Assumption entering Sprint 2: existing NFC tech (NTAG213 stickers, Web NFC API) can be used as-is, no new hardware or infra required.',
        'g-sprint2',
      ),
      card(
        'e_tech',
        'evidence',
        44,
        404,
        'Web NFC works on Android — not on iOS',
        'A real tap correctly drives the flow on Android via Web NFC. iOS has no Web NFC API yet — the one platform gap found. NFC was isolated as a swappable component.',
        'g-sprint2',
      ),

      card(
        'pr2',
        'prototype',
        44,
        44,
        'Sprint 3: physical-vs-digital, visual-vs-numerical A/B tests',
        'Three tests with 4 children: basic digital vs. physical hold-and-tap; visual jars vs. numerical percentages; general usability feedback.',
        'g-sprint3',
      ),
      card(
        'a1',
        'assumption',
        44,
        204,
        'Physical interaction beats purely digital',
        'Assumption entering Sprint 3: children will engage more with a tangible tap than with an equivalent on-screen-only action.',
        'g-sprint3',
      ),
      card(
        'a2',
        'assumption',
        44,
        364,
        'Visual feedback beats numerical information',
        'Assumption entering Sprint 3: jars, coins and progress visuals will help children grasp spending/saving consequences faster than percentages or raw numbers.',
        'g-sprint3',
      ),
      card(
        'e_s3a',
        'evidence',
        44,
        524,
        'Physical tap significantly increased engagement',
        'Children consistently preferred the tangible hold-and-tap interaction — it made the banking experience "feel more real."',
        'g-sprint3',
      ),
      card(
        'e_s3b',
        'evidence',
        44,
        664,
        'Jars beat percentages',
        'Visual progress (jars, coins) was grasped far faster than percentages or abstract numbers — teachers confirmed % isn’t taught until Dutch groups 7–8.',
        'g-sprint3',
      ),

      card(
        'pr3',
        'prototype',
        44,
        44,
        'Sprint 4: 4 parent-child pair tests',
        'Children explored the personalised-card prototype freely while researchers observed, followed by semi-structured interviews with both parent and child.',
        'g-sprint4',
      ),
      card(
        'a3',
        'assumption',
        44,
        204,
        'A personalised card creates ownership',
        'Assumption entering Sprint 4: children will feel ownership and independence from having their own personalised physical card.',
        'g-sprint4',
      ),
      card(
        'a4',
        'assumption',
        44,
        364,
        'Different ages need different complexity',
        `Assumption entering Sprint 4: a single dashboard can't serve a 6-year-old and a 12-year-old equally well.`,
        'g-sprint4',
      ),
      card(
        'e_s4',
        'evidence',
        44,
        524,
        `"I feel just like my mom"`,
        'The physical card created real ownership and independence; the full dashboard overwhelmed younger testers; personalisation visibly increased emotional attachment.',
        'g-sprint4',
      ),

      card(
        'd2',
        'direction',
        3460,
        480,
        'Final concept: Triodos Kids',
        'Kids bank card + NFC Trido keychain + child-facing app (Save / Spend / Give jars) + TV-cast family review — a shared parent-child experience, not a standalone ed-tech tool.',
      ),
      card(
        'd3',
        'direction',
        3460,
        640,
        'Age-adaptive, 3-stage experience',
        'Stage 1 (groups 3/4): jars only. Stage 2 (groups 5/6): + goals/wishlist. Stage 3 (groups 7/8): + progress bars, reflection, independence — grows with the child.',
      ),
      card(
        'd4',
        'direction',
        3460,
        800,
        `No aggressive gamification — design for the child's interest first`,
        'No streaks, artificial rewards or exaggerated celebrations. Save/Spend/Give is offered as a structure, not a rule — engagement should follow from real value.',
      ),
      card(
        'a6',
        'assumption',
        3460,
        960,
        'More gamification would drive stronger engagement',
        'The obvious growth-hacking move: streaks, rewards and celebration mechanics reliably increase daily app opens.',
      ),

      card(
        'd5',
        'direction',
        3900,
        480,
        'Horizon 2: scale the physical ecosystem',
        'Production-ready NFC card + keychain, improved TV experience, personalisation, age-adaptive journeys — planned, not yet evidence-tested.',
      ),
      card(
        'd6',
        'direction',
        3900,
        640,
        'Horizon 3: grow into the teen years',
        'Teen Mode, reduced parental guidance, pathway into adult banking — planned, not yet evidence-tested.',
      ),
    ],
    edges: [
      relation('edge1', 'e1', 'i1', 'supports'),
      relation('edge2', 'e2', 'i2', 'supports'),
      relation('edge3', 'e_s3a', 'i2', 'supports'),
      relation('edge4', 'e_s3b', 'i2', 'supports'),
      relation('edge5', 'e3', 'i4', 'supports'),
      relation('edge6', 'e_s4', 'i4', 'supports'),
      relation('edge7', 'e4', 'i3', 'supports'),
      relation('edge8', 'e5', 'i3', 'supports'),
      relation('edge9', 'e6', 'i3', 'supports'),
      relation('edge10', 'e7', 'i5', 'supports'),
      relation('edge11', 'e8', 'i5', 'supports'),
      relation('edge12', 'e_s3a', 'd2', 'supports'),
      relation('edge13', 'e_s3b', 'd2', 'supports'),
      relation('edge14', 'e_s4', 'd2', 'supports'),

      relation('edge15', 'i1', 'o1', 'leads'),
      relation('edge16', 'i2', 'o1', 'leads'),
      relation('edge17', 'i3', 'o1', 'leads'),
      relation('edge18', 'i4', 'o1', 'leads'),
      relation('edge19', 'i5', 'o1', 'leads'),
      relation('edge20', 'o1', 'd1', 'leads'),
      relation('edge21', 'd1', 'pr1', 'leads'),
      relation('edge22', 'pr1', 'e_tech', 'leads'),
      relation('edge23', 'pr1', 'pr2', 'leads'),
      relation('edge24', 'pr2', 'e_s3a', 'leads'),
      relation('edge25', 'pr2', 'e_s3b', 'leads'),
      relation('edge26', 'pr2', 'pr3', 'leads'),
      relation('edge27', 'pr3', 'e_s4', 'leads'),
      relation('edge28', 'd1', 'd2', 'leads'),
      relation('edge29', 'd2', 'd3', 'leads'),
      relation('edge30', 'd2', 'd4', 'leads'),

      relation('edge31', 'pr1', 'a5', 'tests'),
      relation('edge32', 'pr2', 'a1', 'tests'),
      relation('edge33', 'pr2', 'a2', 'tests'),
      relation('edge34', 'pr3', 'a3', 'tests'),
      relation('edge35', 'pr3', 'a4', 'tests'),

      relation('edge36', 'e_tech', 'a5', 'contradicts'),
      relation('edge37', 'd4', 'a6', 'contradicts'),
    ],
  };
}
