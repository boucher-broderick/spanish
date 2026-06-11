// Per-verb overrides for the engine. Pure regular and -car/-gar/-zar/-uir/vowel-stem
// verbs need NO entry (the engine derives them). Only stem-changers and true
// irregulars from words.txt are listed here.
import { VerbConfig } from "./types";

export const IRREGULARS: Record<string, VerbConfig> = {
  // ---- fully irregular ----
  ser: {
    fullyIrregular: true,
    overrides: {
      present: ["soy", "eres", "es", "somos", "sois", "son"],
      preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
      imperfect: ["era", "eras", "era", "éramos", "erais", "eran"],
      presentSubjunctive: ["sea", "seas", "sea", "seamos", "seáis", "sean"],
    },
  },
  ir: {
    fullyIrregular: true,
    overrides: {
      present: ["voy", "vas", "va", "vamos", "vais", "van"],
      preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
      imperfect: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
      presentSubjunctive: ["vaya", "vayas", "vaya", "vayamos", "vayáis", "vayan"],
    },
  },
  estar: {
    fullyIrregular: true,
    preteriteStem: "estuv",
    overrides: {
      present: ["estoy", "estás", "está", "estamos", "estáis", "están"],
      presentSubjunctive: ["esté", "estés", "esté", "estemos", "estéis", "estén"],
    },
  },
  haber: {
    fullyIrregular: true,
    preteriteStem: "hub",
    futureStem: "habr",
    overrides: {
      present: ["he", "has", "ha", "hemos", "habéis", "han"],
      presentSubjunctive: ["haya", "hayas", "haya", "hayamos", "hayáis", "hayan"],
    },
  },
  dar: {
    fullyIrregular: true,
    overrides: {
      present: ["doy", "das", "da", "damos", "dais", "dan"],
      preterite: ["di", "diste", "dio", "dimos", "disteis", "dieron"],
      presentSubjunctive: ["dé", "des", "dé", "demos", "deis", "den"],
    },
  },
  ver: {
    fullyIrregular: true,
    presentYo: "veo",
    overrides: {
      present: ["veo", "ves", "ve", "vemos", "veis", "ven"],
      preterite: ["vi", "viste", "vio", "vimos", "visteis", "vieron"],
      imperfect: ["veía", "veías", "veía", "veíamos", "veíais", "veían"],
    },
  },
  prever: {
    fullyIrregular: true,
    presentYo: "preveo",
    overrides: {
      present: ["preveo", "prevés", "prevé", "prevemos", "prevéis", "prevén"],
      preterite: ["preví", "previste", "previó", "previmos", "previsteis", "previeron"],
      imperfect: ["preveía", "preveías", "preveía", "preveíamos", "preveíais", "preveían"],
    },
  },

  // ---- presentYo + strong preterite + future stem ----
  tener: { stemChange: "e:ie", presentYo: "tengo", preteriteStem: "tuv", futureStem: "tendr" },
  mantener: { stemChange: "e:ie", presentYo: "mantengo", preteriteStem: "mantuv", futureStem: "mantendr" },
  obtener: { stemChange: "e:ie", presentYo: "obtengo", preteriteStem: "obtuv", futureStem: "obtendr" },
  detener: { stemChange: "e:ie", presentYo: "detengo", preteriteStem: "detuv", futureStem: "detendr" },
  contener: { stemChange: "e:ie", presentYo: "contengo", preteriteStem: "contuv", futureStem: "contendr" },
  sostener: { stemChange: "e:ie", presentYo: "sostengo", preteriteStem: "sostuv", futureStem: "sostendr" },
  venir: { stemChange: "e:ie", presentYo: "vengo", preteriteStem: "vin", futureStem: "vendr" },
  decir: { stemChange: "e:i", presentYo: "digo", preteriteStem: "dij", futureStem: "dir" },
  hacer: { presentYo: "hago", preteriteStem: "hic", futureStem: "har" },
  poder: { stemChange: "o:ue", preteriteStem: "pud", futureStem: "podr" },
  poner: { presentYo: "pongo", preteriteStem: "pus", futureStem: "pondr" },
  suponer: { presentYo: "supongo", preteriteStem: "supus", futureStem: "supondr" },
  proponer: { presentYo: "propongo", preteriteStem: "propus", futureStem: "propondr" },
  imponer: { presentYo: "impongo", preteriteStem: "impus", futureStem: "impondr" },
  disponer: { presentYo: "dispongo", preteriteStem: "dispus", futureStem: "dispondr" },
  exponer: { presentYo: "expongo", preteriteStem: "expus", futureStem: "expondr" },
  querer: { stemChange: "e:ie", preteriteStem: "quis", futureStem: "querr" },
  andar: { preteriteStem: "anduv" },
  saber: {
    presentYo: "sé",
    preteriteStem: "sup",
    futureStem: "sabr",
    overrides: { presentSubjunctive: ["sepa", "sepas", "sepa", "sepamos", "sepáis", "sepan"] },
  },
  salir: { presentYo: "salgo", futureStem: "saldr" },
  traer: { presentYo: "traigo", preteriteStem: "traj" },
  caer: { presentYo: "caigo" },
  conducir: { presentYo: "conduzco", preteriteStem: "conduj" },
  producir: { presentYo: "produzco", preteriteStem: "produj" },
  reducir: { presentYo: "reduzco", preteriteStem: "reduj" },

  // ---- presentYo only (go / zc / j spelling) ----
  conocer: { presentYo: "conozco" },
  reconocer: { presentYo: "reconozco" },
  parecer: { presentYo: "parezco" },
  aparecer: { presentYo: "aparezco" },
  desaparecer: { presentYo: "desaparezco" },
  ofrecer: { presentYo: "ofrezco" },
  nacer: { presentYo: "nazco" },
  crecer: { presentYo: "crezco" },
  establecer: { presentYo: "establezco" },
  pertenecer: { presentYo: "pertenezco" },
  permanecer: { presentYo: "permanezco" },
  convencer: { presentYo: "convenzo" },
  dirigir: { presentYo: "dirijo" },
  exigir: { presentYo: "exijo" },
  recoger: { presentYo: "recojo" },
  proteger: { presentYo: "protejo" },
  surgir: { presentYo: "surjo" },

  // ---- e:i -ir verbs needing a yo spelling tweak ----
  seguir: { stemChange: "e:i", presentYo: "sigo" },
  conseguir: { stemChange: "e:i", presentYo: "consigo" },
  elegir: { stemChange: "e:i", presentYo: "elijo" },

  // ---- pure stem-change verbs ----
  pensar: { stemChange: "e:ie" },
  sentar: { stemChange: "e:ie" },
  despertar: { stemChange: "e:ie" },
  cerrar: { stemChange: "e:ie" },
  empezar: { stemChange: "e:ie" },
  comenzar: { stemChange: "e:ie" },
  negar: { stemChange: "e:ie" },
  perder: { stemChange: "e:ie" },
  entender: { stemChange: "e:ie" },
  defender: { stemChange: "e:ie" },
  extender: { stemChange: "e:ie" },
  atender: { stemChange: "e:ie" },
  manifestar: { stemChange: "e:ie" },
  contar: { stemChange: "o:ue" },
  encontrar: { stemChange: "o:ue" },
  mostrar: { stemChange: "o:ue" },
  recordar: { stemChange: "o:ue" },
  costar: { stemChange: "o:ue" },
  sonar: { stemChange: "o:ue" },
  volver: { stemChange: "o:ue" },
  mover: { stemChange: "o:ue" },
  resolver: { stemChange: "o:ue" },
  soler: { stemChange: "o:ue" },
  aprobar: { stemChange: "o:ue" },
  demostrar: { stemChange: "o:ue" },
  acordar: { stemChange: "o:ue" },
  promover: { stemChange: "o:ue" },
  jugar: { stemChange: "u:ue" },
  adquirir: { stemChange: "i:ie" },
  sentir: { stemChange: "e:ie" },
  preferir: { stemChange: "e:ie" },
  advertir: { stemChange: "e:ie" },
  convertir: { stemChange: "e:ie" },
  referir: { stemChange: "e:ie" },
  requerir: { stemChange: "e:ie" },
  dormir: { stemChange: "o:ue" },
  morir: { stemChange: "o:ue" },
  pedir: { stemChange: "e:i" },
  servir: { stemChange: "e:i" },
  repetir: { stemChange: "e:i" },
  vestir: { stemChange: "e:i" },
  impedir: { stemChange: "e:i" },

  // ---- accent-shift -iar/-uar/-ir verbs ----
  enviar: { stemChange: "i:í" },
  continuar: { stemChange: "u:ú" },
  actuar: { stemChange: "u:ú" },
  situar: { stemChange: "u:ú" },
  reunir: { stemChange: "u:ú" },

  // ---- reír family (future/conditional drop the stem accent: reiré, not reíré) ----
  reír: {
    futureStem: "reir",
    overrides: {
      present: ["río", "ríes", "ríe", "reímos", "reís", "ríen"],
      preterite: ["reí", "reíste", "rió", "reímos", "reísteis", "rieron"],
      presentSubjunctive: ["ría", "rías", "ría", "riamos", "riáis", "rían"],
    },
  },
  sonreír: {
    futureStem: "sonreir",
    overrides: {
      present: ["sonrío", "sonríes", "sonríe", "sonreímos", "sonreís", "sonríen"],
      preterite: ["sonreí", "sonreíste", "sonrió", "sonreímos", "sonreísteis", "sonrieron"],
      presentSubjunctive: ["sonría", "sonrías", "sonría", "sonriamos", "sonriáis", "sonrían"],
    },
  },

  // ---- oír (future/conditional stem drops the infinitive accent: oiré, not oíré) ----
  oír: {
    presentYo: "oigo",
    futureStem: "oir",
    overrides: { present: ["oigo", "oyes", "oye", "oímos", "oís", "oyen"] },
  },
};
