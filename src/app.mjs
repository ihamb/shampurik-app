import { calculateReport, validateData } from './report.mjs';
import { sampleData } from './sample-data.mjs';
import { reportToCsv } from './export.mjs';

const $ = selector => document.querySelector(selector);
const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const preciseRubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const signedRubles = value => (value > 0 ? '+' : '') + preciseRubles.format(value);
let data = structuredClone(sampleData);
let report;
let targetFoodCost = 35;
let isDemo = true;

function announce(message, error = false) {
  const status = $('#status-message');
  status.textContent = message;
  status.classList.toggle('error', error);
  status.hidden = false;
  status.setAttribute('role', error ? 'alert' : 'status');
}

function renderSummary() {
  report = calculateReport(data, { targetFoodCost });
  $('#metric-revenue').textContent = rubles.format(report.totalRevenue);
  $('#metric-increase').textContent = signedRubles(report.ingredientCostIncrease);
  $('#metric-margin').textContent = rubles.format(report.totalContributionMargin);
  $('#metric-margin-percent').textContent = numbers.format(report.contributionMarginPercent) + '%';
  $('#metric-volume').textContent = numbers.format(data.dishes.reduce((total, dish) => total + dish.sales, 0)) + ' порций';
  const increase = report.previousIngredientCost ? report.ingredientCostIncrease / report.previousIngredientCost * 100 : null;
  $('#metric-increase-percent').textContent = increase === null ? 'нет базы сравнения' : `${increase > 0 ? '+' : ''}${numbers.format(increase)}% к прежним затратам`;
  $('#report-period').textContent = data.period;
  $('#workspace-name').textContent = data.name;
  $('#dish-count').textContent = data.dishes.length;
  const aboveTarget = report.dishes.filter(dish => dish.currentCost / dish.price * 100 > targetFoodCost);
  $('#insight-count').textContent = aboveTarget.length;
  const topImpact = [...report.dishes].sort((a, b) => b.costIncrease * b.sales - a.costIncrease * a.sales)[0];
  if (report.ingredientCostIncrease > 0 && topImpact?.costIncrease > 0) {
    $('#insight-title').textContent = `${rubles.format(report.ingredientCostIncrease)} маржи уходит на подорожание продуктов`;
    $('#insight-description').textContent = `Самое большое влияние — «${topImpact.name}»: +${preciseRubles.format(topImpact.costIncrease)} на порцию. Сравнение использует одинаковые рецептуры и объёмы продаж.`;
  } else if (report.ingredientCostIncrease < 0) {
    $('#insight-title').textContent = 'Закупки стали дешевле';
    $('#insight-description').textContent = `При том же объёме продаж стоимость продуктов снизилась на ${rubles.format(Math.abs(report.ingredientCostIncrease))}. Проверьте, отражены ли все ингредиенты и потери.`;
  } else {
    $('#insight-title').textContent = 'Цены не изменили маржу';
    $('#insight-description').textContent = 'При указанных продажах стоимость ингредиентов не изменилась. Сравните долю продуктов с выбранной целью.';
  }
  renderChart();
  renderDishes();
}

function renderChart() {
  const dishes = [...report.dishes].sort((a, b) => b.costIncrease * b.sales - a.costIncrease * a.sales).slice(0, 6);
  const max = Math.max(...dishes.flatMap(dish => [dish.previousCost, dish.currentCost]), 1);
  $('#cost-chart').innerHTML = dishes.map(dish => `<div class="chart-row" aria-label="${escapeHtml(dish.name)}: прежняя стоимость ${escapeHtml(preciseRubles.format(dish.previousCost))}, текущая ${escapeHtml(preciseRubles.format(dish.currentCost))}"><span class="chart-name" title="${escapeHtml(dish.name)}">${escapeHtml(dish.name)}</span><div class="chart-bars" aria-hidden="true"><div class="chart-bar previous" style="width:${dish.previousCost / max * 100}%"></div><div class="chart-bar current" style="width:${dish.currentCost / max * 100}%"></div></div><span class="chart-delta">${escapeHtml(signedRubles(dish.costIncrease))}</span></div>`).join('');
}

function renderDishes() {
  const query = $('#dish-search').value.trim().toLocaleLowerCase('ru-RU');
  const rows = report.dishes.filter(dish => `${dish.name} ${dish.category}`.toLocaleLowerCase('ru-RU').includes(query));
  const statusLabels = { healthy: 'В пределах цели', warning: 'Выше цели', critical: 'Доля > 45%' };
  $('#dish-table').innerHTML = rows.map(dish => `<tr>
    <td><div class="dish-cell"><span class="dish-icon" aria-hidden="true">${dish.category === 'Мангал' ? '♨' : dish.category === 'Гарниры' ? '◌' : '▱'}</span><div><span class="dish-name">${escapeHtml(dish.name)}</span><span class="dish-meta">${escapeHtml(dish.category)} · ${numbers.format(dish.sales)} порций</span></div></div></td>
    <td class="numeric">${escapeHtml(rubles.format(dish.price))}</td>
    <td class="numeric">${escapeHtml(preciseRubles.format(dish.currentCost))}<span class="cell-subline">${escapeHtml(signedRubles(dish.costIncrease))} к прежним</span></td>
    <td><span class="foodcost-number">${numbers.format(dish.foodCostPercent)}%</span><span class="foodcost-track ${dish.status}" aria-hidden="true"><i style="width:${Math.min(100, dish.foodCostPercent)}%"></i></span></td>
    <td class="numeric">${escapeHtml(preciseRubles.format(dish.contributionPerUnit))}</td>
    <td class="numeric suggested-price">${dish.recommendedPrice > dish.price ? escapeHtml(rubles.format(dish.recommendedPrice)) : '<span class="dish-meta">Без повышения</span>'}</td>
    <td><span class="status-pill ${dish.status}">${statusLabels[dish.status]}</span></td>
  </tr>`).join('');
  $('#empty-search').hidden = rows.length > 0;
}

function renderIngredients() {
  $('#ingredient-list').innerHTML = data.ingredients.map(ingredient => `<div class="ingredient-input"><label for="ingredient-${escapeHtml(ingredient.id)}">${escapeHtml(ingredient.name)}</label><div class="ingredient-edit"><span>было<br>${escapeHtml(preciseRubles.format(ingredient.previousPrice))}</span><input id="ingredient-${escapeHtml(ingredient.id)}" data-ingredient="${escapeHtml(ingredient.id)}" type="number" min="0" max="1000000" step="0.01" value="${ingredient.currentPrice}" aria-label="Текущая цена: ${escapeHtml(ingredient.name)}, рублей за ${escapeHtml(ingredient.unit)}" required></div><span class="ingredient-unit">₽ / ${escapeHtml(ingredient.unit)}</span></div>`).join('');
}

function updateSourceLabels() {
  $('.dataset-note').textContent = isDemo ? 'Вымышленные данные для демонстрации' : 'Данные из вашего файла · первичные документы не проверены';
  $('.workspace div span').textContent = isDemo ? 'Демонстрационное кафе' : 'Локальные данные из файла';
  $('.demo-notice p').innerHTML = isDemo
    ? '<strong>Это работающий пример, а не отчёт реального клиента.</strong> Измените цены ниже или загрузите свой JSON — все цифры пересчитаются.'
    : '<strong>Вы работаете со своим файлом.</strong> Расчёт зависит от полноты рецептур, цен и продаж. Данные остаются в вашем браузере.';
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#ingredient-list').addEventListener('change', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.ingredient) return;
  const ingredient = data.ingredients.find(item => item.id === input.dataset.ingredient);
  if (!ingredient) return;
  if (!input.checkValidity() || input.value.trim() === '') {
    input.setAttribute('aria-invalid', 'true');
    announce('Укажите цену от 0 до 1 000 000 ₽ с точностью до копейки. Отчёт не изменён.', true);
    return;
  }
  ingredient.currentPrice = input.valueAsNumber;
  input.removeAttribute('aria-invalid');
  renderSummary();
  announce(`Цена «${ingredient.name}» обновлена. Показатели пересчитаны для того же объёма продаж.`);
});

$('#food-cost-target').addEventListener('input', event => {
  targetFoodCost = Number(event.target.value);
  $('#target-value').value = targetFoodCost;
  renderSummary();
});
$('#dish-search').addEventListener('input', renderDishes);
$('#reset-demo').addEventListener('click', () => {
  data = structuredClone(sampleData);
  isDemo = true;
  targetFoodCost = 35;
  $('#food-cost-target').value = '35';
  $('#target-value').value = '35';
  $('#dish-search').value = '';
  updateSourceLabels();
  renderIngredients();
  renderSummary();
  announce('Демонстрационные данные восстановлены. Ваш файл не сохранялся.');
});
$('#print-report').addEventListener('click', () => window.print());
$('#export-csv').addEventListener('click', () => {
  download('shampurik-report.csv', reportToCsv(data, report), 'text/csv;charset=utf-8');
  announce('CSV-отчёт подготовлен для скачивания.');
});
$('#download-example').addEventListener('click', () => download('shampurik-example.json', JSON.stringify(sampleData, null, 2), 'application/json;charset=utf-8'));

$('#import-json').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_048_576) throw new Error('Максимальный размер файла — 1 МБ.');
    let imported;
    try { imported = JSON.parse(await file.text()); }
    catch { throw new Error('Файл не является корректным JSON. Скачайте пример и сохраните его структуру.'); }
    const errors = validateData(imported);
    if (errors.length) throw new Error(errors.slice(0, 5).join(' '));
    calculateReport(imported, { targetFoodCost });
    data = imported;
    isDemo = false;
    $('#dish-search').value = '';
    updateSourceLabels();
    renderIngredients();
    renderSummary();
    announce('Файл загружен локально. Проверьте единицы измерения и полноту ингредиентов: труд, налоги и прочие расходы не включены.');
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Не удалось прочитать файл.', true);
  } finally {
    event.target.value = '';
  }
});

const dialog = $('#pilot-dialog');
document.querySelectorAll('[data-open-pilot]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
$('#close-pilot').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
} });

renderIngredients();
renderSummary();
