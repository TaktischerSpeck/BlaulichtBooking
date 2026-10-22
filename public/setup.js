const form = document.querySelector("#setup-form");
form.elements.baseUrl.value = location.origin;
function databaseTypeChanged() {
  const isSql = form.elements.databaseType.value !== "sqlite";
  document.querySelector("#sql-fields").hidden = !isSql;
  for (const element of document.querySelectorAll("#sql-fields input"))
    element.disabled = !isSql;
}
form.elements.databaseType.addEventListener("change", databaseTypeChanged);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#install"),
    error = document.querySelector("#setup-error"),
    status = document.querySelector("#setup-status");
  error.hidden = true;
  button.disabled = true;
  status.textContent =
    "Verbindung wird geprüft und Tabellen werden angelegt. Bitte kurz warten …";
  const payload = Object.fromEntries(new FormData(form));
  payload.dbSsl = form.elements.dbSsl.checked;
  payload.smtpSecure = form.elements.smtpSecure.checked;
  try {
    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    status.textContent =
      "Einrichtung abgeschlossen. Das Buchungssystem wird geöffnet …";
    location.assign("/");
  } catch (failure) {
    error.textContent =
      failure.message || "Die Einrichtung konnte nicht abgeschlossen werden.";
    error.hidden = false;
    error.scrollIntoView({ block: "center", behavior: "smooth" });
    status.textContent = "";
    button.disabled = false;
  }
});
databaseTypeChanged();
