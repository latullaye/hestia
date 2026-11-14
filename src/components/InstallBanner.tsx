// On a phone or a tablet, Hestia is meant to be installed (notifications, full screen): as long as it runs in a browser
// tab, a banner says how.
import { useEffect, useState } from "react";
import { canPromptInstall, isIOS, isMobile, isStandalone, onInstallChange, promptInstall } from "../lib/device";
import { Sheet } from "./ui";

export function InstallBanner() {
  const [, refresh] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => onInstallChange(() => refresh((n) => n + 1)), []);
  if (isStandalone() || (!isMobile() && !canPromptInstall())) return null;
  return (
    <>
      <div className="banner">
        <span className="grow">Installe Hestia pour recevoir les notifications.</span>
        <button className="btn" onClick={() => (canPromptInstall() ? void promptInstall() : setHelp(true))}>Installer</button>
      </div>
      {help && (
        <Sheet title="Installer Hestia" onClose={() => setHelp(false)}>
          {isIOS() ? (
            <ol className="col" style={{ paddingLeft: 20, margin: 0 }}>
              <li>Ouvre cette page dans <b>Safari</b>.</li>
              <li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li>
              <li>Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</li>
              <li>Ouvre Hestia depuis son icône, puis active les notifications dans <b>Plus › Réglages</b>.</li>
            </ol>
          ) : (
            <ol className="col" style={{ paddingLeft: 20, margin: 0 }}>
              <li>Ouvre cette page dans <b>Chrome</b>.</li>
              <li>Touche le menu <b>⋮</b> en haut à droite.</li>
              <li>Choisis <b>Installer l'application</b> (ou <b>Ajouter à l'écran d'accueil</b>).</li>
              <li>Ouvre Hestia depuis son icône, puis active les notifications dans <b>Plus › Réglages</b>.</li>
            </ol>
          )}
        </Sheet>
      )}
    </>
  );
}
