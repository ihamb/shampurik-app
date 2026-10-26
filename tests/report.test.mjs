import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReport, validateData } from '../src/report.mjs';
import { sampleData } from '../src/sample-data.mjs';

const fixture = () => ({
  name: 'Тестовое кафе', period: 'Месяц',
  ingredients: [{ id: 'meat', name: 'Мясо', unit: 'кг', previousPrice: 200, currentPrice: 240 }],
  dishes: [{ id: 'dish', name: 'Порция', category: 'Мангал', price: 100, sales: 10, recipe: [{ ingredientId: 'meat', quantity: 0.2 }] }],
});

test('считает себестоимость, вклад и сравнение закупки при том же объёме продаж', () => {
  const data = fixture();
  const unchanged = structuredClone(data);
  const report = calculateReport(data);
  assert.equal(report.totalRevenue, 1000);
  assert.equal(report.totalIngredientCost, 480);
  assert.equal(report.previousIngredientCost, 400);
  assert.equal(report.ingredientCostIncrease, 80);
  assert.equal(report.totalContributionMargin, 520);
  assert.equal(report.contributionMarginPercent, 52);
  assert.equal(report.dishes[0].previousCost, 40);
  assert.equal(report.dishes[0].currentCost, 48);
  assert.equal(report.dishes[0].costIncrease, 8);
  assert.equal(report.dishes[0].foodCostPercent, 48);
  assert.equal(report.dishes[0].recommendedPrice, 140);
  assert.equal(report.dishes[0].contributionPerUnit, 52);
  assert.equal(report.dishes[0].projectedRecovery, 400);
  assert.equal(report.projectedRecovery, 400);
  assert.equal(report.dishes[0].status, 'critical');
  assert.deepEqual(data, unchanged);
  report.dishes[0].recipe[0].quantity = 5;
  assert.deepEqual(data, unchanged, 'результат не должен менять исходный рецепт');
});

test('рекомендованная цена округляется вверх до 10 ₽ и зависит от цели', () => {
  const data = fixture();
  assert.equal(calculateReport(data, { targetFoodCost: 40 }).dishes[0].recommendedPrice, 120);
  data.ingredients[0].currentPrice = 150;
  assert.equal(calculateReport(data, { targetFoodCost: 100 }).dishes[0].recommendedPrice, 30, 'не добавляет 10 ₽ на точной границе');
  assert.equal(calculateReport(data).projectedRecovery, 0, 'снижение цены не считается приростом');
});

test('пороговые значения статусов сравниваются строго', () => {
  const data = fixture();
  data.dishes[0].recipe[0].quantity = 1;
  data.ingredients[0].currentPrice = 35;
  assert.equal(calculateReport(data).dishes[0].status, 'healthy');
  data.ingredients[0].currentPrice = 45;
  assert.equal(calculateReport(data).dishes[0].status, 'warning');
  data.ingredients[0].currentPrice = 45.01;
  assert.equal(calculateReport(data).dishes[0].status, 'critical');
});

test('нулевые продажи не создают NaN; отрицательный вклад остаётся видимым', () => {
  const data = fixture();
  data.dishes[0].sales = 0;
  const empty = calculateReport(data);
  for (const key of ['totalRevenue', 'totalIngredientCost', 'previousIngredientCost', 'totalContributionMargin', 'contributionMarginPercent', 'ingredientCostIncrease', 'projectedRecovery']) {
    assert.equal(empty[key], 0, key);
  }
  data.dishes[0].sales = 10;
  data.ingredients[0].currentPrice = 1000;
  assert.equal(calculateReport(data).totalContributionMargin, -1000);
});

test('рост цен вниз отображает экономию, бесплатные ингредиенты допустимы', () => {
  const data = fixture();
  data.ingredients[0].currentPrice = 0;
  const report = calculateReport(data);
  assert.equal(report.ingredientCostIncrease, -400);
  assert.equal(report.totalContributionMargin, 1000);
  assert.equal(report.dishes[0].recommendedPrice, 0);
});

test('неизвестные ссылки, повторы id и некорректные числа отклоняются', () => {
  const data = fixture();
  data.ingredients.push({ ...data.ingredients[0] });
  data.dishes[0].recipe.push({ ingredientId: 'missing', quantity: -1 });
  data.dishes[0].price = Infinity;
  data.dishes[0].sales = 1.5;
  const errors = validateData(data);
  assert.ok(errors.some(error => error.includes('уже используется')));
  assert.ok(errors.some(error => error.includes('не найден')));
  assert.ok(errors.some(error => error.includes('количество')));
  assert.ok(errors.some(error => error.includes('цена продажи')));
  assert.ok(errors.some(error => error.includes('продажи')));
  assert.throws(() => calculateReport(data), /Ингредиент/);
});

test('пустые, слишком большие и неструктурированные входные данные отклоняются', () => {
  for (const invalid of [null, [], {}, { ...fixture(), dishes: [] }, { ...fixture(), ingredients: Array(201).fill({}) }]) {
    assert.ok(validateData(invalid).length > 0);
    assert.throws(() => calculateReport(invalid));
  }
  const data = fixture();
  data.dishes[0].price = 0;
  assert.throws(() => calculateReport(data), /больше 0/);
  data.dishes[0].price = '100';
  assert.throws(() => calculateReport(data), /цена продажи/);
});

test('отклоняет нечисловые, бесконечные и недопустимые цели', () => {
  for (const targetFoodCost of [0, -1, 100.1, NaN, Infinity, '35', null]) {
    assert.throws(() => calculateReport(fixture(), { targetFoodCost }), /Целевой food cost/);
  }
});

test('денежные цены допускают копейки, но не доли копейки; количества могут быть дробными', () => {
  const data = fixture();
  data.dishes[0].price = 0.015;
  assert.throws(() => calculateReport(data), /цена продажи.*точностью до копейки/);
  data.dishes[0].price = 0.01;
  data.ingredients[0].previousPrice = 0.01;
  data.ingredients[0].currentPrice = 59.99;
  data.dishes[0].recipe[0].quantity = 0.012345;
  assert.deepEqual(validateData(data), []);
  assert.doesNotThrow(() => calculateReport(data));
  data.dishes[0].price = 59.99;
  assert.deepEqual(validateData(data), []);
  data.ingredients[0].previousPrice = 0.015;
  assert.throws(() => calculateReport(data), /прежняя цена.*точностью до копейки/);
  data.ingredients[0].previousPrice = 0.01;
  data.ingredients[0].currentPrice = 59.995;
  assert.throws(() => calculateReport(data), /текущая цена.*точностью до копейки/);
});

test('вымышленный пример валиден, разнообразен и согласуется по итогам', () => {
  assert.deepEqual(validateData(sampleData), []);
  const report = calculateReport(sampleData);
  assert.equal(report.dishes.length, 6);
  assert.deepEqual(new Set(report.dishes.map(dish => dish.status)), new Set(['healthy', 'warning', 'critical']));
  assert.equal(report.totalRevenue, 397860);
  assert.equal(report.totalIngredientCost, 150565.5);
  assert.equal(report.totalContributionMargin, 247294.5);
  assert.equal(report.projectedRecovery, 65330);
});
