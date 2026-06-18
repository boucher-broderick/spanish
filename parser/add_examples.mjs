// Merge words harvested from a unit's EXAMPLE sentences and exercises into
// data/vocab.json. Curated list/box words are kept as-is; example-derived words
// are tagged { src: "example" }. Dedupes by lemma (article stripped) and sorts.
//
//   node parser/add_examples.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data", "vocab.json");

// Harvested nouns/adjectives/adverbs from Unit 1 examples & exercises, by section.
const EXAMPLES = {
  1: {
    "Regular Verbs in the Present Tense": {
      nouns: [
        ["la familia", "family", "f"], ["el edificio", "building", "m"],
        ["el apartamento", "apartment", "m"], ["la hija", "daughter", "f"],
        ["la universidad", "university", "f"], ["la visita", "visit", "f"],
        ["el perro", "dog", "m"], ["la cena", "dinner", "f"],
        ["la escalera", "stairs, staircase", "f"], ["el gato", "cat", "m"],
        ["la leche", "milk", "f"], ["la actriz", "actress", "f"],
        ["el crítico", "critic", "m"], ["el amigo", "friend", "m"],
      ],
      adjectives: [],
      adverbs: [],
    },
    "When Is the Present Tense Used in Spanish?": {
      nouns: [
        ["la puerta", "door", "f"], ["la fruta", "fruit", "f"],
        ["el supermercado", "supermarket", "m"], ["el plan", "plan", "m"],
        ["la reunión", "meeting", "f"], ["el verano", "summer", "m"],
        ["el café", "coffee", "m"], ["el té", "tea", "m"], ["la casa", "house", "f"],
        ["el desayuno", "breakfast", "m"], ["el programa", "program", "m"],
        ["la noticia", "news item", "f"], ["el mensaje", "message", "m"],
        ["el vegetal", "vegetable", "m"], ["el aniversario", "anniversary", "m"],
        ["la sala", "living room", "f"], ["el patio", "backyard, patio", "m"],
        ["la música", "music", "f"], ["la enchilada", "enchilada", "f"],
        ["el niño", "child, boy", "m"], ["la limonada", "lemonade", "f"],
        ["el campo", "countryside", "m"], ["la ciudad", "city", "f"],
        ["la novela", "novel", "f"], ["el misterio", "mystery", "m"],
        ["la ciencia ficción", "science fiction", "f"], ["la política", "politics", "f"],
        ["el deporte", "sport", "m"], ["el día", "day", "m"], ["la noche", "night", "f"],
      ],
      adjectives: [
        ["electrónico, electrónica", "electronic"], ["libre", "free"],
      ],
      adverbs: [
        ["ahora", "now"], ["normalmente", "normally, usually"],
        ["mañana", "tomorrow"], ["generalmente", "generally"],
      ],
    },
    "Irregular Verbs in the Present Tense": {
      nouns: [
        ["el compañero de trabajo", "coworker", "m"], ["la conferencia", "lecture", "f"],
        ["la trampa", "trap", "f"], ["la canción", "song", "f"],
        ["la solución", "solution", "f"], ["el problema", "problem", "m"],
        ["el agua", "water", "f"], ["el vaso", "glass", "m"],
        ["los pantalones", "pants", "m"], ["el coche", "car", "m"],
        ["el cuadro", "painting", "m"], ["el regalo", "gift", "m"],
        ["la orden", "order", "f"], ["la verdad", "truth", "f"],
        ["el autobús", "bus", "m"], ["la silla", "chair", "f"],
        ["la posibilidad", "possibility", "f"], ["el estudio", "studio", "m"],
        ["la televisión", "television", "f"], ["la cocina", "kitchen, cooking", "f"],
        ["el plato", "dish, plate", "m"], ["la obra de arte", "work of art", "f"],
        ["el aficionado", "fan", "m"], ["el comentario", "comment", "m"],
        ["el admirador", "admirer, fan", "m"], ["la estrella", "star", "f"],
        ["el técnico", "technician", "m"], ["la creación", "creation", "f"],
      ],
      adjectives: [
        ["famoso, famosa", "famous"], ["favorito, favorita", "favorite"],
        ["exquisito, exquisita", "exquisite"], ["ocupado, ocupada", "busy"],
        ["callado, callada", "quiet"], ["apasionado, apasionada", "passionate"],
        ["favorable", "favorable"],
      ],
      adverbs: [
        ["bien", "well"], ["muy", "very"], ["juntos", "together"],
        ["temprano", "early"],
      ],
    },
    "Verbs with Spelling Changes in the Present Tense": {
      nouns: [
        ["la explicación", "explanation", "f"], ["el color", "color", "m"],
        ["el fuego", "fire", "m"], ["el periódico", "newspaper", "m"],
        ["el obstáculo", "obstacle", "m"],
      ],
      adjectives: [],
      adverbs: [],
    },
    "Dar, Haber, Hacer, and Tener in Expressions with a Special Meaning": {
      nouns: [
        ["el abrazo", "hug", "m"], ["el grito", "shout", "m"], ["la hora", "hour", "f"],
        ["la multitud", "crowd", "f"], ["el reloj", "clock, watch", "m"],
        ["el sol", "sun", "m"], ["la neblina", "fog", "f"], ["la mañana", "morning", "f"],
        ["el viaje", "trip", "m"], ["el daño", "harm", "m"], ["el papel", "role, paper", "m"],
        ["el actor", "actor", "m"], ["el tío", "uncle", "m"], ["el maestro", "teacher", "m"],
        ["el primo", "cousin", "m"], ["el sospechoso", "suspect", "m"],
        ["el accidente", "accident", "m"], ["el concierto", "concert", "m"],
        ["la carretera", "highway", "f"], ["el cuarto", "room", "m"],
        ["la serpiente", "snake", "f"], ["el médico", "doctor", "m"],
      ],
      adjectives: [["inocente", "innocent"]],
      adverbs: [["aquí", "here"], ["pronto", "soon"], ["tarde", "late"], ["a veces", "sometimes"]],
    },
  },
};

const stripArticle = (s) =>
  s.toLowerCase().replace(/^(el|la|los|las|un|una)\s+/, "").trim();

const vocab = JSON.parse(readFileSync(FILE, "utf8"));
let added = 0;

for (const unit of vocab.units) {
  const ex = EXAMPLES[unit.unit];
  if (!ex) continue;
  for (const section of unit.sections) {
    const add = ex[section.title];
    if (!add) continue;
    for (const pos of ["nouns", "adjectives", "adverbs"]) {
      const existing = new Set(section[pos].map((w) => stripArticle(w.es)));
      for (const row of add[pos] || []) {
        const [es, en, gender] = row;
        if (existing.has(stripArticle(es))) continue;
        existing.add(stripArticle(es));
        section[pos].push(gender ? { es, en, gender, src: "example" } : { es, en, src: "example" });
        added++;
      }
      section[pos].sort((a, b) => stripArticle(a.es).localeCompare(stripArticle(b.es), "es"));
    }
  }
}

writeFileSync(FILE, JSON.stringify(vocab, null, 2) + "\n");
console.log(`merged ${added} example-derived words into ${FILE}`);
