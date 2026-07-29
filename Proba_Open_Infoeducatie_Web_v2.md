# OPEN Web - RuleShop
**Probă practică - 20 de ore**  
**Context:** RuleShop - Rule Engine pentru un magazin online  
**Proba OPEN - secțiunea Web** | **Durata:** 20 de ore | **Punctaj maxim:** 1000

Managerul tău s-a săturat să-ți ceară modificări pentru fiecare campanie, reducere sau excepție de livrare. Își dorește să poată controla singur comportamentul magazinului: să schimbe prețuri, să introducă reduceri, să ajusteze livrarea, să blocheze tranzacții suspecte și chiar să modifice tema site-ului, fără schimbarea codului aplicației.

Scopul probei este realizarea unei platforme web în care deciziile importante ale unui magazin online sunt luate în timp real de un **rule engine** configurabil, administrat printr-un **control plane**. Platforma trebuie să includă și un modul de inteligență artificială care asistă analiza și îmbunătățirea regulilor, fără a publica automat modificări. De asemenea, platforma trebuie să suporte cel puțin două magazine independente.

---

## 1. Obiectivul aplicației

Soluția trebuie să conțină două componente principale:
1. **Un magazin online funcțional**, utilizat de clienți și administratori;
2. **Un control plane** în care regulile sunt create, testate, versionate și publicate.

Magazinul nu trebuie să fie doar o interfață demonstrativă. Modificarea unei reguli publicate trebuie să schimbe comportamentul aplicației fără recompilarea sau republicarea codului sursă.

---

## 2. Magazinul online

Aplicația trebuie să ofere cel puțin următoarele funcționalități:
* Catalog de produse, pagină de produs și căutare sau filtrare;
* Coș de cumpărături și checkout funcțional;
* Cumpărături în regim guest și prin cont autentificat;
* Plasarea comenzilor și consultarea istoricului acestora;
* Administrarea produselor, a prețului de bază și a stocului;
* Afișarea clară a deciziilor relevante produse de rule engine.

> **Notă:** Nu este necesară integrarea unei plăți reale. Plata poate fi simulată, dar întregul flux de checkout trebuie să fie coerent și persistent.

---

## 3. Control Plane și modelul regulilor

Administratorii trebuie să poată crea, modifica, testa și publica reguli dintr-o interfață dedicată. Editorul poate fi realizat sub forma unui editor vizual, drag-and-drop, formular structurat sau limbaj DSL.

O regulă trebuie să poată conține:
* Una sau mai multe condiții, inclusiv grupări logice de tip **AND**, **OR** și, pentru punctaj superior, **NOT**;
* Operatori compatibili cu tipul datelor evaluate;
* Una sau mai multe acțiuni;
* Prioritate, stare și metadate relevante;
* O strategie clară pentru rezolvarea conflictelor dintre reguli.

Regulile trebuie păstrate într-o formă structurată și versionabilă, nu doar ca stare internă a interfeței. **Nu este acceptată executarea directă a codului arbitrar introdus de utilizator.**

Website-ul trebuie să solicite decizii printr-un API de decisioning. Un răspuns trebuie să conțină atât decizia finală, cât și informații suficiente pentru a explica modul în care aceasta a fost obținută.

**Exemplu răspuns API:**
```json
{
  "decision": {
    "discountPercent": 15
  },
  "rulesetVersion": 7,
  "matchedRules": ["vip-discount"],
  "traceId": "eval-8f21"
}
```

---

## 4. Puncte de decizie

Rule engine-ul trebuie să controleze în mod real cel puțin următoarele aspecte ale magazinului:
* Prețuri și reduceri;
* Metode de livrare și costul acestora;
* Verificări antifraudă la checkout;
* Disponibilitatea produselor;
* Recompense sau beneficii de loialitate;
* Tema ori personalizarea vizuală a magazinului.

Pentru punctaj maxim, punctele de decizie trebuie să utilizeze același motor generic. Implementarea unei logici separate și hardcodate pentru fiecare caz va fi punctată parțial.

### IMPORTANT - Implementarea motorului de reguli
Motorul de reguli trebuie proiectat și implementat de către concurent, **de la zero**.

**Nu este permisă** utilizarea unor biblioteci, framework-uri, servicii externe sau componente preexistente specializate pentru definirea, interpretarea ori executarea regulilor. De asemenea, evaluarea regulilor nu poate fi delegată unui serviciu extern sau unui model de inteligență artificială.

Concurentul trebuie să implementeze cel puțin:
* Reprezentarea structurată a regulilor;
* Evaluarea condițiilor și a operatorilor;
* Aplicarea acțiunilor;
* Gestionarea priorităților și a conflictelor dintre reguli;
* Validarea regulilor;
* Integrarea motorului cu API-ul de decisioning.

*Este permisă utilizarea bibliotecilor și framework-urilor generale pentru realizarea interfeței, a API-ului, autentificare, acces la baza de date, serializare JSON, validarea datelor și alte funcționalități auxiliare. Restricția se aplică exclusiv componentelor care implementează sau substituie motorul de reguli.*

---

## 5. Capabilitățile platformei

Platforma trebuie să ofere un ciclu de viață complet al regulilor:
* Versiuni și afișarea diferențelor dintre acestea;
* Publicare stabilă și publicare canary pentru un procent configurabil de utilizatori;
* Repartizare canary deterministă pentru același utilizator sau aceeași sesiune;
* Rollback la o versiune anterioară;
* Kill switch pentru dezactivarea rapidă a unei reguli, versiuni sau categorii de decizii;
* Explicație pentru fiecare evaluare și istoric consultabil;
* Jurnal de audit pentru operațiile importante.

Platforma trebuie să suporte cel puțin două magazine independente. Produsele, comenzile, utilizatorii, regulile și istoricul unui magazin nu trebuie să poată fi accesate din alt magazin.

---

## 6. Modulul de inteligență artificială

Inteligența artificială trebuie integrată într-o funcționalitate reală a platformei, nu doar într-un chatbot separat. Sunt acceptate, printre altele, următoarele direcții:
* Identificarea regulilor neutilizate, redundante sau cu rezultate slabe;
* Propunerea unor modificări de condiții, praguri, priorități sau acțiuni;
* Explicarea în limbaj natural a efectelor unei reguli ori ale unui diff;
* Clasificarea incidentelor antifraudă sau analiza feedbackului clienților;
* Generarea unei reguli structurate pornind de la o cerință exprimată în limbaj natural.

Sugestiile trebuie validate înainte de aplicare. Pentru îmbunătățirea regulilor, aplicația trebuie să poată simula o versiune candidat pe evenimente istorice și să prezinte metrici comparabile cu versiunea curentă. Valorile statistice trebuie calculate de aplicație, nu doar declarate de serviciul IA.

### Control uman obligatoriu
Nicio regulă propusă sau modificată de modulul de inteligență artificială nu poate fi publicată automat. Un utilizator autorizat trebuie să examineze rezultatul și să aprobe explicit publicarea.

---

## 7. Securitate și calitate tehnică

Soluția trebuie să includă autentificare și autorizare bazată pe roluri, verificată pe server. Sunt avute în vedere roluri precum client, operator, administrator de magazin și administrator al platformei.

Vor fi evaluate în mod special:
* Izolarea datelor între magazine;
* Validarea datelor și protejarea endpoint-urilor;
* Stocarea sigură a parolelor și secretelor;
* Publicarea controlată a regulilor;
* Tratarea erorilor, a cererilor repetate și a operațiilor concurente;
* Organizarea codului, testabilitatea și reproductibilitatea instalării.

---

## 8. Criterii de jurizare și departajare

| Categorie | Componentă evaluată | Punctaj |
| :--- | :--- | :---: |
| **1. Magazin online** | Catalog de produse, pagină de produs, căutare și filtrare | 25 |
| | Coș și checkout funcțional, cu date persistente | 35 |
| | Cumpărături ca guest și ca utilizator autentificat | 25 |
| | Plasarea, istoricul și gestionarea comenzilor | 25 |
| | Administrarea produselor, a prețului de bază și a stocului | 20 |
| | Vizibilitatea în interfață a deciziilor produse de rule engine | 10 |
| | **Subtotal** | **140** |
| **2. Control Plane și rule engine** | Editor vizual, drag-and-drop, formular structurat sau limbaj DSL | 45 |
| | Condiții, operatori, acțiuni, grupări logice și prioritate | 40 |
| | Reguli stocate într-o formă structurată și versionabilă | 25 |
| | API de decisioning utilizat efectiv de magazin | 35 |
| | Validarea regulilor, testarea lor și rezolvarea conflictelor | 35 |
| | **Subtotal** | **180** |
| **3. Puncte de decizie** | Prețuri și reduceri | 30 |
| | Metode de livrare și costul livrării | 25 |
| | Detecția și tratarea riscului de fraudă la checkout | 25 |
| | Disponibilitatea produselor | 20 |
| | Recompense și beneficii de loialitate | 20 |
| | Tema sau personalizarea vizuală a magazinului | 20 |
| | **Subtotal** | **140** |
| **4. Lifecycle și observabilitate** | Versionare și afișarea diferențelor dintre versiuni | 30 |
| | Publicare canary și repartizare procentuală deterministă | 30 |
| | Rollback la o versiune anterioară | 20 |
| | Kill switch pentru reguli, versiuni sau categorii de decizii | 20 |
| | Explicarea fiecărei evaluări și a regulilor care au contribuit | 20 |
| | Istoric al evaluărilor și jurnal de audit | 20 |
| | **Subtotal** | **140** |
| **5. Inteligență artificială** | Integrarea modulului IA într-o funcționalitate reală a platformei | 20 |
| | Detectarea regulilor neutilizate, redundante sau cu performanță slabă | 20 |
| | Simulare pe evenimente istorice și afișarea statisticilor | 25 |
| | Propuneri de îmbunătățire cu metrici de business și impact estimat | 20 |
| | Validarea rezultatelor, tratarea erorilor și a nivelului de încredere | 15 |
| | Aprobare umană obligatorie înainte de publicare | 10 |
| | Versionarea, trasabilitatea și auditarea evaluărilor IA | 10 |
| | **Subtotal** | **120** |
| **6. Securitate și multi-tenancy** | Izolarea produselor, comenzilor, utilizatorilor, regulilor și istoricului între magazine | 30 |
| | Autentificare și autorizare pe roluri, verificate pe server | 25 |
| | Protecția API-urilor și a datelor | 20 |
| | Validarea intrărilor și stocarea sigură a parolelor și secretelor | 15 |
| | Publicarea controlată și auditarea operațiilor importante | 10 |
| | **Subtotal** | **100** |
| **7. Calitatea produsului și a codului** | UX și design pentru magazin | 20 |
| | UX pentru control plane și editorul de reguli | 20 |
| | Vizibilitatea și claritatea deciziilor în interfață | 10 |
| | Arhitectură, separarea responsabilităților și mentenabilitate | 20 |
| | Claritatea codului, validări, tipizare și tratarea erorilor | 15 |
| | Teste proprii și instalare reproductibilă | 15 |
| | Performanță, responsive design și accesibilitate de bază | 10 |
| | **Subtotal** | **110** |
| **8. Prezentare și documentație** | Calitatea prezentării și a demonstrației live | 25 |
| | Documentația tehnică și instrucțiunile de instalare | 20 |
| | Claritatea scenariilor demonstrate | 15 |
| | Explicarea arhitecturii, a limitărilor și a compromisurilor | 10 |
| | **Subtotal** | **70** |
| **TOTAL** | | **1000** |

---

## 9. Predare și demonstrație

La finalul probei trebuie predate:
* Codul sursă complet;
* Instrucțiuni clare de instalare și pornire;
* Configurația necesară, fără secrete incluse în repository;
* Date demonstrative suficiente pentru evaluare;
* Documentație succintă privind arhitectura, API-ul și modelul regulilor.

În cadrul demonstrației, concurentul trebuie să prezinte cel puțin:
1. Un flux complet de cumpărare;
2. Crearea și publicarea unei reguli noi;
3. Schimbarea comportamentului magazinului fără modificarea codului;
4. Explicația unei decizii;
5. O funcție bazată pe inteligență artificială și mecanismul de aprobare umană;
6. Rollback sau kill switch.

---

### Principiul probei
Se urmărește construirea unui produs web coerent, utilizabil și robust. Nu este necesară finalizarea tuturor funcționalităților pentru obținerea unui punctaj bun. Soluțiile vor fi diferențiate prin gradul de generalitate al motorului, integrarea reală în magazin, calitatea tehnică și nivelul de finisare al produsului.