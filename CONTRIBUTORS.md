# Közreműködői útmutató

Köszönjük, hogy hozzájárulnál a **Crude Tycoon** fejlesztéséhez! Ez az útmutató a környezet felállításához és a projekt konvencióihoz ad eligazítást. A játékról a [README.md](README.md), a mechanikák és az architektúra részleteiről a [doc/artifact.md](doc/artifact.md) szól.

## Előfeltételek

- [Bun](https://bun.sh) (a függőségeket a `bun.lock` rögzíti, ezért `npm`/`yarn` helyett Bunt használjunk)
- Git
- Modern böngésző (a hangeffektek Web Audio API-t használnak)

## Első lépések

```bash
git clone https://github.com/gakbit/crude-tycoon.git
cd crude-tycoon
bun install
bun run dev
```

A fejlesztői szerver a `http://localhost:3000` címen indul (`0.0.0.0` hoston, hot reloaddal).

## Parancsok

| Parancs | Mit csinál |
| --- | --- |
| `bun install` | Függőségek telepítése |
| `bun run dev` | Fejlesztői szerver indítása (`vite --port=3000 --host=0.0.0.0`) |
| `bun run lint` | Típusellenőrzés (`tsc --noEmit`); ez a projekt egyetlen statikus ellenőrzése |
| `bun run build` | Produkciós build a `dist/` mappába (`vite build`) |
| `bun run preview` | A produkciós build helyi kipróbálása |
| `bun run clean` | A `dist/` és `server.js` törlése (`rm -rf`, ezért Windowson Git Bashben futtasd) |

Pull request előtt futtasd legalább a `bun run lint` és a `bun run build` parancsot, és próbáld ki a változtatásodat a böngészőben. Automatizált tesztek jelenleg nincsenek a projektben.

## Projektstruktúra

| Mappa | Tartalom |
| --- | --- |
| `src/App.tsx` | Gyökér komponens, eseménykezelők, modálok és az autosave |
| `src/components/` | UI nézetek és interaktív műveleti ablakok |
| `src/engine/` | Játéklogika: `turnEngine.ts` (körlépés, akciók, MI), `economyEngine.ts` (árak, kitermelés, válságok), `sabotageEngine.ts`, `operationsEngine.ts`, `gameTypes.ts` (típusok) |
| `src/data/` | Statikus adatok: 16 régió, kőzetrétegek, eseménysablonok |
| `src/i18n/` | Többnyelvűség: szótártípusok, nyelvfelismerés, provider, `locales/*.ts` |
| `src/utils/` | `storage.ts` (mentés és betöltés), `soundFx.ts` (szintetizált hangok) |
| `doc/artifact.md` | A teljes projekt élő dokumentációja |

## Konvenciók

- **Nyelv a kódban:** a forráskód, az azonosítók, a típusok és a kommentek angolul íródnak.
- **Felhasználói szövegek:** soha ne írj szöveget közvetlenül a komponensekbe vagy a motorba. Minden megjelenő szöveg a szótárakból jön (lásd lent).
- **Stílus:** Tailwind CSS v4 osztályok, a meglévő sötét ipari paletta és a számokhoz `font-mono tabular-nums`.
- **Kommentek:** csak a nem magától értetődő döntéseket indokold.
- **Kis, célzott változtatások:** egy PR egy témával foglalkozzon, kerüld a nem kapcsolódó átformázást.
- **Mentéskompatibilitás:** ha új mezőt veszel fel a `GameState`-be, vagy módosítasz egy meglévőt, pótold az alapértéket a `src/utils/storage.ts` `normalizeLoadedState()` függvényében, hogy a régi mentések betölthetők maradjanak.

## Többnyelvűség (i18n)

A játék 8 nyelvű: `en`, `hu`, `de`, `es`, `fr`, `pt`, `pl`, `zh`.

- A közös szótárséma a `src/i18n/types.ts` `TranslationSchema` interfésze. Mind a 8 `src/i18n/locales/*.ts` fájl ezzel van típusozva, így egy hiányzó kulcs fordítási hibát (`bun run lint`) okoz.
- **Új felirat hozzáadása:**
  1. vedd fel a kulcsot a `TranslationSchema`-ba,
  2. add meg az értéket **mind a 8** nyelvi fájlban,
  3. a komponensben a `useI18n()` hookból kapott `dict`-et használd, a motorban a `getDict()`-et.
- A változó részeket `{név}` helyőrzővel jelöld, és az `interpolate()` függvénnyel töltsd ki.
- A számokat, devizát, hordómennyiséget és dátumot a `src/i18n/index.ts` formázóival jelenítsd meg (`formatCurrencyI18n`, `formatBarrelsI18n`, `formatGameDateI18n` stb.), ne kézzel.
- A régió-, esemény- és hírszövegek lokalizálását a `getLocalized*` segédfüggvények végzik. Új naplóbejegyzésnél adj meg `i18nKey` és `i18nParams` értéket is, és vedd fel a kulcsot a `logEntries` szótárba, hogy a bejegyzés nyelvváltáskor is átforduljon.
- A nyelvválasztó (`LanguageSelector`) szándékosan csak a kezdőképernyőn, a Mentés / Betöltés és a GY.I.K. ablakban jelenik meg. A felső sávba (`TopBar`) ne kerüljön.
- Új vagy módosított felületnél ellenőrizd a hosszabb német, francia, spanyol és lengyel feliratok, valamint a kínai karakterek elrendezését is.

## Dokumentáció karbantartása

A [doc/artifact.md](doc/artifact.md) a játék élő leírása. Ha új funkciót adsz hozzá, vagy játékegyensúlyt, interaktív műveletet vagy UI-t módosítasz, frissítsd benne az érintett szakaszt is.

## Változtatások beküldése

1. Készíts külön ágat a módosításhoz.
2. Futtasd a `bun run lint` és `bun run build` parancsot.
3. Írj rövid, a változtatást leíró commit üzenetet.
4. Nyiss pull requestet, amelyben leírod, mit és miért módosítottál, és hogyan próbáltad ki.
