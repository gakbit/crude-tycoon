# Crude Tycoon

Körökre osztott, az 1990-es évek hangulatát idéző olajipari gazdasági stratégiai játék. 1994 januárjában indulsz, és a cél, hogy a vállalatod a legnagyobb nettó vagyonú szereplővé váljon három MI-rivális ellen, mielőtt lejár az üzleti időtáv, vagy valaki más éri el a célvagyont.

## Kipróbálás

A játék bármikor kipróbálható böngészőben, telepítés nélkül:

**<https://crude-tycoon.gakbit.workers.dev>**

A felület **8 nyelven** érhető el (angol, magyar, német, spanyol, francia, portugál, lengyel, egyszerűsített kínai). A nyelv induláskor a böngészőből derül ki, és a kezdőképernyőn, a Mentés / Betöltés ablakban vagy a GY.I.K.-ban bármikor, játék közben is átváltható.

## A játék röviden

- **16 globális olajmező**, szárazföldi és tengeri koncessziókkal, eltérő fúrási nehézséggel, tartalékkal és politikai stabilitással.
- **Gazdasági szimuláció:** koncessziók vásárlása, tárolótartályok és kutak építése, termelési kvóták, olajeladás, banki hitel, ciklusosan változó olajár (`$28–$135 / hordó`).
- **Három MI-rivális** eltérő személyiséggel (óvatos, terjeszkedő, kiegyensúlyozó), akiknek a valós pénzügyi adatait csak könyvvizsgálattal vagy külső elemzővel lehet megismerni.
- **Geopolitikai és éghajlati válságok:** hurrikán, sztrájk, vezetékrepedés, kibertámadás, tartályhajó-baleset és más események.
- **Interaktív műveletek**, mindegyikhez fizetős, „kiszervezhető” alternatívával:
  - kézi reakciófúrás vagy kivitelezői fúrás,
  - belső könyvvizsgálat vagy külső elemző,
  - kézi rendszerbehatolás vagy külső hekker-csoport,
  - kézi tankerirányítás vagy tengeri mentőszolgálat,
  - helyszíni magminta-elemzés vagy külső geológiai intézet.
- **Három nehézségi szint** (Könnyű, Normál, Nehéz), automatikus mentés és 3 manuális mentési rekesz a böngészőben.

A mechanikák részletes leírása a [doc/artifact.md](doc/artifact.md) fájlban található.

## Technológia

React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, lucide-react. A játék teljesen kliensoldali, a mentések a böngésző `localStorage`-ában tárolódnak.

## Helyi futtatás

Szükséges: [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

A fejlesztői szerver a <http://localhost:3000> címen érhető el.

A fejlesztéshez további útmutatót a [CONTRIBUTORS.md](CONTRIBUTORS.md) tartalmaz.
