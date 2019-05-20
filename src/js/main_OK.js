import "../css/main.css";
import "zepto";
import _ from "lodash";
import moment from "moment";

moment.locale("fr", {
  months: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
  ],
  monthsShort: [
    "jan",
    "fév",
    "mar",
    "avr",
    "mai",
    "juin",
    "juil",
    "aoû",
    "sep",
    "oct",
    "nov",
    "déc"
  ],
  weekdays: [
    "Dimanche",
    "Lundi ",
    "Mardi ",
    "Mercredi ",
    "Jeudi ",
    "Vendredi ",
    "Samedi "
  ],
  weekdaysShort: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
});

const today = moment();
let curDate = today.clone();

const options = {
  lookaheadDays: {
    ponctuel: 21,
    regulier: 7,
    pin: 2
  },
  combine: true
};

const dataUrl = [
  "https://gist.githubusercontent.com/nltesown/e0992fae1cd70e5c2a764fb369ea6515/raw/cycles.json",
  "https://gist.githubusercontent.com/nltesown/e505dc0a525b66c4afb3900d61cda643/raw/cycles_ext.json"
];

const temp = _.template(`
  <h2><%= curDate.startOf("day").format("dddd D MMM YYYY") %></h2>
  <a href="http://www.cinematheque.fr/cycle/<%= data[0][0].idCycleSite %>.html">
    <div class="cycle pinned">
    <div class="progress" style="width:<%= data[0][0].progress %>%;"></div>
    <div class="title"><%= data[0][0].title %></div>
      <div class="dates"><%= datesConcat(data[0][0].dateFrom, data[0][0].dateTo) %></div>
      <% if (data[0][0].startsIn > 0) { %>
        <div class="soon">J-<%= data[0][0].startsIn  %></div>
      <% } %>
    </div>
  </a>
  <div class="cycle expo"></div>
  <% _.forEach(data[1], c => { %>
    <a href="http://www.cinematheque.fr/cycle/<%= c.idCycleSite %>.html">
      <div class="cycle<% if (!!c.surcycle) { %> permanent<% } %>">
        <div class="progress" style="width:<%= c.progress %>%;"></div>
      <% if (c.surcycle) { %>
        <div class="surcycle"><%= c.surcycle %></div>
      <% } %>
        <div class="title"><%= c.title %></div>
        <div class="dates"><%= datesConcat(c.dateFrom, c.dateTo) %></div>
        <% if (c.startsIn > 0) { %>
          <div class="soon">J-<%= c.startsIn  %></div>
        <% } %>
      </div>
    </a>
  <%}); %>
`);

(async function() {
  await domReady();
  let dataCycle = await fetchAsync(dataUrl[0]);
  let dataCycleExt = await fetchAsync(dataUrl[1]);
  let data = _.concat(dataCycle, dataCycleExt);

  console.log("***", data);

  // Traitement initial des données : calcule la date de publication (théorique), transforme les dates en objets `moment`.
  data = _(data)
    .map(d => {
      return _(d)
        .assign({
          isPonctuel: _.isUndefined(d.surcycle),
          dateFrom: moment(d.dateFrom),
          dateTo: (a => (!!a ? moment(a) : null))(d.dateTo),
          pubDate: pubDate(moment(d.dateFrom))
        })
        .value();
    })
    .value();

  $(".container")
    .on("wheel", e => {
      let delta = e.deltaY / 3;
      curDate.add(delta, "day");
      render();
      e.preventDefault();
    })
    .trigger("wheel");

  function render() {
    $(".container").html(
      temp({
        data: _.tap(
          currentData(data, curDate, options.lookaheadDays, options.combine),
          data => {
            console.log(data);
          }
        ),
        curDate: curDate,
        datesConcat: datesConcat
      })
    );
  }
})();

function domReady() {
  return new Promise((resolve, reject) => {
    document.addEventListener("DOMContentLoaded", () => {
      return resolve();
    });
  });
}

async function fetchAsync(url) {
  let response = await fetch(url);
  return response.json();
}

/**
 * currentData
 * Renvoie le sous-ensemble des cycles visibles à la date currentDate.
 * @param {Array} data Données des cycles.
 * @param {Object} currentDate Objet moment : date courante.
 * @param {Object} lookaheadDays Nombre de jours avant la date de début d'un cycle à partir duquel il est annoncé. Par défaut, 0.
 * @param {boolean} combine True: on combine dans la même chronologie cycles ponctuels et réguliers.
 * @return {Array} Données filtrées.
 */
function currentData(data, currentDate, lookaheadDays, combine) {
  currentDate = currentDate.clone().startOf("day");
  let temp = data;

  // 1. On retire les cycles terminés, les cycles non publiés et les cycles "lointains".
  temp = _(temp)
    .reject(c =>
      c.dateTo === null
        ? false
        : c.dateTo.isBefore(currentDate, "days") ||
          c.pubDate.isAfter(currentDate, "days") ||
          c.dateFrom.diff(currentDate, "days") >
            (c.isPonctuel
              ? lookaheadDays.ponctuel || 0
              : lookaheadDays.regulier || 0)
    )
    .sortBy(d => d.dateFrom)
    .reverse() // Premier tri
    .value();

  // 2. On complète avec le compte à rebours pour les cycles ponctuels
  temp = _(temp)
    .map(d => {
      return _(d)
        .thru(e => {
          if (e.isPonctuel === true) {
            return _(e)
              .assign({
                endsIn: d.dateFrom.diff(currentDate, "days"),
                startsIn: d.dateFrom.diff(currentDate, "days")
              })
              .value();
          } else {
            return e;
          }
        })
        .value();
    })
    .value();

  // 2bis. On calcule le taux de progression
  temp = _(temp)
    .map(d => {
      return _(d)
        .assign({
          progress: (() => {
            if (d.dateTo === null) return 0;
            return (
              (d.dateFrom.diff(currentDate, "days") /
                d.dateFrom.diff(d.dateTo, "days")) *
              100
            );
          })()
        })
        .value();
    })
    .value();

  // 3. On isole le cycle à épingler (règle par défaut)
  let pos = _(temp).findIndex(
    d =>
      d.isPonctuel === true &&
      d.dateFrom.diff(currentDate, "days") <= (lookaheadDays.pin || 0)
  );
  let pin = temp.splice(pos, 1);

  // 4. En mode non combiné, on effectue un double tri (ponctuels, réguliers)
  if (options.combine === false) {
    temp = _(temp)
      .partition(d => d.isPonctuel === true)
      .map(d =>
        _(d)
          .sortBy(e => e.dateFrom)
          .reverse()
          .value()
      )
      .flatten()
      .value();
  }
  return [pin, temp];
}

/**
 * datesConcat
 * @description
 * Concaténation intelligente de dates de début / date de fin.
 * @example
 * ["1", "jan", "2016"], ["31", "déc", "2016"] => "1 jan-31 déc 2016"
 * @param {Object|null} a Objet moment : date de début. (NOTE : Actuellement, ne prend pas en compte les cas où la date de début se serait pas fourni.)
 * @param {Objet|null} b Objet moment ou valeur `null` : date de fin.
 * @returns {string} Chaîne des deux dates concaténées.
 * @todo Pouvoir passer `separators` en paramètre.
 */
function datesConcat(a, b) {
  a = moment.isMoment(a) ? a.format("D MMMM YYYY") : null;
  b = moment.isMoment(b) ? b.format("D MMMM YYYY") : null;
  let separators = ["Du ", " au ", "À partir du ", "Jusqu'au ", ""];

  if (a === b) {
    return separators[4] + a;
  }

  if (a && b) {
    a = a.split(" ");
    b = b.split(" ");
    let b2 = _.clone(b);
    let i = a.length - 1;
    if (a[i] === b[i] && i > -1) {
      i--;
      a.pop();
      b.pop();
      datesConcat(a, b);
    }
    return a.length === 0
      ? b2.join(" ")
      : separators[0] + [a.join(" "), b2.join(" ")].join(separators[1]);
  }

  if (a && !b) {
    return separators[2] + a;
  }
}

/**
 * pubDate
 * @description
 * Calcule à partir de la date de début d'un cycle sa date théorique de publication,
 * le 20 du mois précédant le début d'un trimestre de programme (mars, juin, septembre, décembre).
 * @param {Object} dateFrom Objet moment
 * @returns {Object} Objet moment
 */
function pubDate(dateFrom) {
  return dateFrom
    .clone()
    .year(dateFrom.year() - (dateFrom.month() < 2 ? 1 : 0))
    .month([12, 12, 3, 3, 3, 6, 6, 6, 9, 9, 9, 12][dateFrom.month()] - 2)
    .date(20)
    .startOf("day");
}
