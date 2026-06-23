// Progressive enhancement for the budget calculator. The page works without
// this (the percentages are the answer); this just fills in live dollar amounts.
(function () {
  "use strict";
  var form = document.getElementById("budget-form");
  if (!form) return;
  var input = document.getElementById("total");
  var cells = Array.prototype.slice.call(document.querySelectorAll(".amt[data-pct]"));

  var fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  function update() {
    var total = parseFloat(input.value);
    if (!isFinite(total) || total <= 0) {
      cells.forEach(function (c) {
        c.textContent = "—";
      });
      return;
    }
    cells.forEach(function (c) {
      var pct = parseFloat(c.getAttribute("data-pct")) || 0;
      c.textContent = fmt.format((total * pct) / 100);
    });
  }

  input.addEventListener("input", update);
  update();
})();
