# NextGen-CICD

Im Rahmen dieses Projekts sollen die Möglichkeiten einer Github CI CD Pipelines dargestellt werden.
Ausgangssitutation ist, dass ich aktuell in einem Projekt arbeite bei dem die Umgebungen wegen fehlschlagenden Tests die zum Teil flaky sind Rot sind. Meiner Meinung nach fehlt es an einem sauberen Quality Gate prinzip, bei dem Die Umgebungen immer grün sein sollen und bei jedem Versuch etwas zu Deployen, sollen die INT-Tests als Quality Gate für Integration dienen und Abnahme tests als Quality Gate für Abnahme. 
Stand heute werden die Änderungen auf Integration deployed und kein Rollback durchgeführt, falls die Tests fehlschlagen. 


Szenario ist folgendes:

APP
- Eine Einfache Beispiel Applikation zur Stammdatenerfassung
- Die Applikation besteht aus einem Frontend und Backend
- Die Daten werden in einer Postgres Datenbank gespeichert

Umgebungen:
Wir haben die Umgebungen Integration, Abnahme und PROD


Tests: 
Playwright Test als E2E INT Tests für Frontend


Zielsetzung:
- Das ganze soll als Docker-Anwendung oder andere Containerlösung implemenitert werden. Dabei sollen notwendige Pakete innerhalb des Containers erfolgen und nicht auf meinem Notebook
- Demonstration wie man es richtig macht
- Beispiel App implementieren inklusive Playwright Tests
- State of the Art Pipeline implementieren mit Quality Gates
- Rollback von Deployments und Herstellung der vorherigen sauberen Version
- Rollback oder wiederherstellung der Datenbank, weil durch deployments Datenbank migrationen passieren können
