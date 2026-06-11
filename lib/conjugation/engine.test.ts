import { describe, it, expect } from "vitest";
import { conjugate } from "./engine";

// Each expectation is [yo, tú, él, nosotros, vosotros, ellos].
describe("regular verbs", () => {
  it("hablar", () => {
    const c = conjugate("hablar");
    expect(c.present).toEqual(["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"]);
    expect(c.preterite).toEqual(["hablé", "hablaste", "habló", "hablamos", "hablasteis", "hablaron"]);
    expect(c.imperfect).toEqual(["hablaba", "hablabas", "hablaba", "hablábamos", "hablabais", "hablaban"]);
    expect(c.future).toEqual(["hablaré", "hablarás", "hablará", "hablaremos", "hablaréis", "hablarán"]);
    expect(c.conditional[0]).toBe("hablaría");
    expect(c.presentSubjunctive).toEqual(["hable", "hables", "hable", "hablemos", "habléis", "hablen"]);
    expect(c.imperfectSubjunctive).toEqual(["hablara", "hablaras", "hablara", "habláramos", "hablarais", "hablaran"]);
  });
  it("comer", () => {
    const c = conjugate("comer");
    expect(c.present).toEqual(["como", "comes", "come", "comemos", "coméis", "comen"]);
    expect(c.preterite).toEqual(["comí", "comiste", "comió", "comimos", "comisteis", "comieron"]);
    expect(c.presentSubjunctive[0]).toBe("coma");
  });
  it("vivir", () => {
    const c = conjugate("vivir");
    expect(c.present).toEqual(["vivo", "vives", "vive", "vivimos", "vivís", "viven"]);
    expect(c.preterite).toEqual(["viví", "viviste", "vivió", "vivimos", "vivisteis", "vivieron"]);
  });
});

describe("orthographic", () => {
  it("buscar", () => {
    const c = conjugate("buscar");
    expect(c.preterite[0]).toBe("busqué");
    expect(c.presentSubjunctive).toEqual(["busque", "busques", "busque", "busquemos", "busquéis", "busquen"]);
  });
  it("llegar", () => {
    expect(conjugate("llegar").preterite[0]).toBe("llegué");
    expect(conjugate("llegar").presentSubjunctive[0]).toBe("llegue");
  });
  it("leer (vowel stem)", () => {
    expect(conjugate("leer").preterite).toEqual(["leí", "leíste", "leyó", "leímos", "leísteis", "leyeron"]);
  });
  it("incluir (-uir)", () => {
    const c = conjugate("incluir");
    expect(c.present).toEqual(["incluyo", "incluyes", "incluye", "incluimos", "incluís", "incluyen"]);
    expect(c.preterite).toEqual(["incluí", "incluiste", "incluyó", "incluimos", "incluisteis", "incluyeron"]);
    expect(c.presentSubjunctive[0]).toBe("incluya");
  });
});

describe("stem-changing", () => {
  it("pensar e:ie", () => {
    const c = conjugate("pensar");
    expect(c.present).toEqual(["pienso", "piensas", "piensa", "pensamos", "pensáis", "piensan"]);
    expect(c.presentSubjunctive).toEqual(["piense", "pienses", "piense", "pensemos", "penséis", "piensen"]);
  });
  it("volver o:ue", () => {
    expect(conjugate("volver").present[0]).toBe("vuelvo");
    expect(conjugate("volver").presentSubjunctive[3]).toBe("volvamos");
  });
  it("pedir e:i", () => {
    const c = conjugate("pedir");
    expect(c.present).toEqual(["pido", "pides", "pide", "pedimos", "pedís", "piden"]);
    expect(c.preterite).toEqual(["pedí", "pediste", "pidió", "pedimos", "pedisteis", "pidieron"]);
    expect(c.presentSubjunctive).toEqual(["pida", "pidas", "pida", "pidamos", "pidáis", "pidan"]);
  });
  it("dormir o:ue (-ir)", () => {
    const c = conjugate("dormir");
    expect(c.present[0]).toBe("duermo");
    expect(c.preterite).toEqual(["dormí", "dormiste", "durmió", "dormimos", "dormisteis", "durmieron"]);
    expect(c.presentSubjunctive).toEqual(["duerma", "duermas", "duerma", "durmamos", "durmáis", "duerman"]);
  });
  it("sentir e:ie (-ir)", () => {
    const c = conjugate("sentir");
    expect(c.preterite[2]).toBe("sintió");
    expect(c.presentSubjunctive[3]).toBe("sintamos");
  });
  it("empezar e:ie + zar", () => {
    const c = conjugate("empezar");
    expect(c.present[0]).toBe("empiezo");
    expect(c.preterite[0]).toBe("empecé");
    expect(c.presentSubjunctive).toEqual(["empiece", "empieces", "empiece", "empecemos", "empecéis", "empiecen"]);
  });
  it("jugar u:ue + gar", () => {
    const c = conjugate("jugar");
    expect(c.present).toEqual(["juego", "juegas", "juega", "jugamos", "jugáis", "juegan"]);
    expect(c.preterite[0]).toBe("jugué");
    expect(c.presentSubjunctive).toEqual(["juegue", "juegues", "juegue", "juguemos", "juguéis", "jueguen"]);
  });
  it("seguir e:i + gu", () => {
    const c = conjugate("seguir");
    expect(c.present).toEqual(["sigo", "sigues", "sigue", "seguimos", "seguís", "siguen"]);
    expect(c.preterite[2]).toBe("siguió");
    expect(c.presentSubjunctive).toEqual(["siga", "sigas", "siga", "sigamos", "sigáis", "sigan"]);
  });
  it("enviar i:í / continuar u:ú", () => {
    expect(conjugate("enviar").present).toEqual(["envío", "envías", "envía", "enviamos", "enviáis", "envían"]);
    expect(conjugate("enviar").presentSubjunctive[3]).toBe("enviemos");
    expect(conjugate("continuar").present[0]).toBe("continúo");
  });
});

describe("irregular verbs", () => {
  it("ser", () => {
    const c = conjugate("ser");
    expect(c.present).toEqual(["soy", "eres", "es", "somos", "sois", "son"]);
    expect(c.preterite).toEqual(["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"]);
    expect(c.imperfect).toEqual(["era", "eras", "era", "éramos", "erais", "eran"]);
    expect(c.imperfectSubjunctive).toEqual(["fuera", "fueras", "fuera", "fuéramos", "fuerais", "fueran"]);
  });
  it("ir", () => {
    const c = conjugate("ir");
    expect(c.present).toEqual(["voy", "vas", "va", "vamos", "vais", "van"]);
    expect(c.imperfect[0]).toBe("iba");
    expect(c.presentSubjunctive[0]).toBe("vaya");
  });
  it("tener", () => {
    const c = conjugate("tener");
    expect(c.present).toEqual(["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"]);
    expect(c.preterite).toEqual(["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"]);
    expect(c.future[0]).toBe("tendré");
    expect(c.presentSubjunctive).toEqual(["tenga", "tengas", "tenga", "tengamos", "tengáis", "tengan"]);
    expect(c.imperfectSubjunctive[3]).toBe("tuviéramos");
  });
  it("hacer", () => {
    const c = conjugate("hacer");
    expect(c.present[0]).toBe("hago");
    expect(c.preterite).toEqual(["hice", "hiciste", "hizo", "hicimos", "hicisteis", "hicieron"]);
    expect(c.future[0]).toBe("haré");
  });
  it("decir", () => {
    const c = conjugate("decir");
    expect(c.present).toEqual(["digo", "dices", "dice", "decimos", "decís", "dicen"]);
    expect(c.preterite).toEqual(["dije", "dijiste", "dijo", "dijimos", "dijisteis", "dijeron"]);
    expect(c.future[0]).toBe("diré");
  });
  it("poder", () => {
    const c = conjugate("poder");
    expect(c.present[0]).toBe("puedo");
    expect(c.preterite).toEqual(["pude", "pudiste", "pudo", "pudimos", "pudisteis", "pudieron"]);
    expect(c.presentSubjunctive).toEqual(["pueda", "puedas", "pueda", "podamos", "podáis", "puedan"]);
  });
  it("dar / estar / saber", () => {
    expect(conjugate("dar").preterite).toEqual(["di", "diste", "dio", "dimos", "disteis", "dieron"]);
    expect(conjugate("dar").presentSubjunctive[0]).toBe("dé");
    expect(conjugate("estar").present).toEqual(["estoy", "estás", "está", "estamos", "estáis", "están"]);
    expect(conjugate("estar").preterite[0]).toBe("estuve");
    expect(conjugate("saber").present[0]).toBe("sé");
    expect(conjugate("saber").presentSubjunctive[0]).toBe("sepa");
  });
  it("ver / conocer / venir", () => {
    expect(conjugate("ver").present).toEqual(["veo", "ves", "ve", "vemos", "veis", "ven"]);
    expect(conjugate("ver").imperfect[0]).toBe("veía");
    expect(conjugate("conocer").present[0]).toBe("conozco");
    expect(conjugate("conocer").presentSubjunctive[0]).toBe("conozca");
    expect(conjugate("venir").present).toEqual(["vengo", "vienes", "viene", "venimos", "venís", "vienen"]);
    expect(conjugate("venir").preterite[0]).toBe("vine");
    expect(conjugate("venir").presentSubjunctive[3]).toBe("vengamos");
  });
  it("traer / oír", () => {
    expect(conjugate("traer").preterite).toEqual(["traje", "trajiste", "trajo", "trajimos", "trajisteis", "trajeron"]);
    expect(conjugate("oír").present).toEqual(["oigo", "oyes", "oye", "oímos", "oís", "oyen"]);
    expect(conjugate("oír").preterite).toEqual(["oí", "oíste", "oyó", "oímos", "oísteis", "oyeron"]);
    expect(conjugate("oír").future[0]).toBe("oiré");
  });
  it("andar / requerir (audit fixes)", () => {
    expect(conjugate("andar").preterite).toEqual(["anduve", "anduviste", "anduvo", "anduvimos", "anduvisteis", "anduvieron"]);
    expect(conjugate("andar").imperfectSubjunctive[0]).toBe("anduviera");
    expect(conjugate("requerir").present[0]).toBe("requiero");
    expect(conjugate("requerir").preterite[2]).toBe("requirió");
    expect(conjugate("requerir").presentSubjunctive[3]).toBe("requiramos");
  });
  it("reír (audit fixes)", () => {
    const c = conjugate("reír");
    expect(c.present).toEqual(["río", "ríes", "ríe", "reímos", "reís", "ríen"]);
    expect(c.future).toEqual(["reiré", "reirás", "reirá", "reiremos", "reiréis", "reirán"]);
    expect(c.presentSubjunctive).toEqual(["ría", "rías", "ría", "riamos", "riáis", "rían"]);
  });
});
