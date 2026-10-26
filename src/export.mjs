/** Quote CSV cells and neutralise spreadsheet formulas in user-provided text. */
export function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function reportToCsv(data, report) {
  const rows = [
    ['Shampurik — отчёт по стоимости ингредиентов'],
    ['Заведение', data.name],
    ['Период', data.period],
    ['Целевые затраты на продукты, %', report.targetFoodCost],
    ['Маржа исключает аренду, зарплаты, налоги, упаковку и прочие расходы. Это не чистая прибыль.'],
    ['Сценарные цены не учитывают изменение спроса.'],
    [],
    ['Блюдо', 'Категория', 'Продажи, порций', 'Цена, ₽', 'Прежняя стоимость продуктов, ₽', 'Текущая стоимость продуктов, ₽', 'Доля продуктов, %', 'Маржа на порцию, ₽', 'Цена при целевой доле, ₽'],
    ...report.dishes.map(dish => [dish.name, dish.category, dish.sales, dish.price, dish.previousCost, dish.currentCost, dish.foodCostPercent, dish.contributionPerUnit, dish.recommendedPrice]),
    [],
    ['Выручка, ₽', report.totalRevenue],
    ['Ингредиенты, ₽', report.totalIngredientCost],
    ['Рост затрат при том же объёме, ₽', report.ingredientCostIncrease],
    ['Маржа после ингредиентов, ₽', report.totalContributionMargin],
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
