import { z } from "zod";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const workshopId = z.string().regex(/^[A-Z0-9-]{4,16}$/);
const page = {
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(2048).optional(),
};
const strict = (fields) => z.object(fields).strict();
export const tools = {
  get_student_scores: {
    description:
      "Read unified Inspi student credit totals. Omit studentId to list authorized students. Workshop filtering and pagination apply to bulk lists; omit those fields when selecting one student. Awards intentionally add final team score and individual score.",
    schema: strict({
      studentId: id.optional(),
      workshopId: workshopId.optional(),
      ...page,
    }).refine(
      (a) =>
        !a.studentId ||
        (a.workshopId === undefined &&
          a.limit === undefined &&
          a.cursor === undefined),
      {
        message:
          "Workshop filters and pagination are available only on bulk score lists.",
      },
    ),
    route: ({ studentId, ...query }) => [
      studentId ? `/students/${studentId}/scores` : "/students/scores",
      query,
    ],
  },
  get_colleges: {
    description: "Read facilitator college catalog or one college.",
    schema: strict({
      collegeId: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
        .optional(),
      ...page,
    }),
    route: ({ collegeId, ...q }) => [
      collegeId ? `/colleges/${collegeId}` : "/colleges",
      q,
    ],
  },
  get_workshop_scores: {
    description:
      "Read latest published workshop results; keeps all three measures separate.",
    schema: strict({
      workshopId,
      collegeId: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
        .optional(),
      ...page,
    }),
    route: ({ workshopId, ...q }) => [`/workshops/${workshopId}/scores`, q],
  },
  get_student_details: {
    description:
      "Read the authorized learner profile. Omit studentId for yourself. No history expansions.",
    schema: strict({ studentId: id.optional() }),
    route: (a) => [a.studentId ? `/students/${a.studentId}` : "/me", {}],
  },
  find_students: {
    description:
      "Facilitator-only student catalog; optional exact email, college and workshop filters. Credits are latest published results.",
    schema: strict({
      email: z.string().email().max(254).optional(),
      collegeId: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
        .optional(),
      workshopId: workshopId.optional(),
      include: z.literal("credits").optional(),
      ...page,
    }),
    route: (a) => ["/students", a],
  },
  list_student_workshops: {
    description:
      "Read permanent owner/facilitator workshop history. Continue nextCursor even after an empty page.",
    schema: strict({ studentId: id.optional(), ...page }),
    route: ({ studentId, ...q }) => [
      studentId ? `/students/${studentId}/workshops` : "/me/workshops",
      q,
    ],
  },
  get_student_score: {
    description:
      "Read separate published individual credits, team credits and learning points for one workshop. Null is unknown, not zero.",
    schema: strict({ studentId: id, workshopId }),
    route: ({ studentId, ...q }) => [`/students/${studentId}/scores`, q],
  },
  get_student_participation: {
    description:
      "Read published activity summary for one workshop; excludes answers and private comments.",
    schema: strict({ studentId: id, workshopId }),
    route: ({ studentId, ...q }) => [`/students/${studentId}/participation`, q],
  },
  get_participant_submissions: {
    description:
      "Read immutable published personal quiz answers for the authorized learner and workshop. Excludes live submissions and feedback.",
    schema: strict({ studentId: id, workshopId }),
    route: ({ studentId, ...q }) => [`/students/${studentId}/submissions`, q],
  },
  get_workshop_details: {
    description:
      "Read session metadata for an authorized learner or assigned staff member.",
    schema: strict({ workshopId }),
    route: (a) => [`/workshops/${a.workshopId}`, {}],
  },
  get_certificates: {
    description:
      "Read private owner/facilitator certificate metadata, including revoked versions. This does not download PDFs.",
    schema: strict({ studentId: id.optional(), ...page }),
    route: ({ studentId, ...q }) => [
      studentId ? `/students/${studentId}/certificates` : "/me/certificates",
      q,
    ],
  },
};
export function apiClient(baseUrl, token, fetchImpl = fetch) {
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/api/v1" ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      ))
  )
    throw Error("API URL must be HTTPS /api/v1, or localhost HTTP /api/v1.");
  if (typeof token !== "string" || !token || /\s/.test(token))
    throw Error(
      "A scoped API token or short-lived Firebase ID token is required.",
    );
  return async (name, input) => {
    const tool = tools[name];
    if (!tool) throw Error("Unknown tool.");
    const args = tool.schema.parse(input),
      [path, query] = tool.route(args);
    const url = new URL(base.href + path);
    for (const [k, v] of Object.entries(query))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok)
      throw Error(
        `API read failed (${res.status}); check identity, permissions or token expiry.`,
      );
    const result = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  };
}
