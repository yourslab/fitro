var saveTimeout;
$(function() {
	var finalIngredientsList = [];
	var finalIngredientsQuantityList = [];
	var finalRecipe = {}

	var costPerShake = -1;
	var totalMass = -1;

	var weightMeasurement = 'lbs',
		sliderMin = 50,
		sliderMax = 75;

	var nutrients = [
		'calories', 'carbs', 'sugar', 'stevia', 'protein', 'fat', 'saturated-fat','biotin', 'calcium', 'chloride', 'cholesterol', 'choline', 'chromium', 'copper',
		'fiber', 'folate', 'iodine', 'iron', 'manganese', 'magnesium', 'molybdenum', 'niacin', 'omega_3', 'omega_6',
		'pantothenic', 'phosphorus', 'potassium', 'riboflavin', 'selenium', 'sodium', 'sulfur', 'thiamin',
		'vitamin_a', 'vitamin_b12', 'vitamin_b6', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k', 'zinc'
	];

	var minRatio = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Minimum ratio of ingredient's mass to total mass
		maxRatio = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // Maximum ratio of ingredient's mass to total mass

	// These nutrients are considered 'more important'
	var macroNutrients = ["calories", "protein", "carbs", "fat"];

	//console.log("Successfully fetched recipe.\n");

	var ingredients     = recipe.ingredients,
		nutrientTargets = recipe.nutrientTargets,
		i, j, nutrient;

	// Combine blends into a single ingredient
	ingredients = ingredients.map(function(ingredient) {
		if( Object.prototype.toString.call( ingredient ) === '[object Array]' ) {
			var max_serving = 0;
			var max_container_size = ingredient[0].container_size/(ingredient[0].percent/100);
			ingredient.forEach(function(part) {
				if(part.serving > max_serving) max_serving = part.serving;

				// Find the maximum amount of grams that we can make given 
				// each ingredient's container size
				if(Math.floor(part.container_size/(part.percent/100)) < max_container_size) 
					max_container_size = Math.floor(part.container_size/(part.percent/100));
			});
			//console.log("max_container_size "+max_container_size);
			if(max_serving) {
				ingredient.forEach(function(part) {
					// Normalize each ingredient to have the same serving size
					// and apply percentage multiplier
					multiplier = max_serving/part.serving;
					percent = part.percent/100;
					part.serving = max_serving*percent;

					nutrients.forEach(function(nutrient) {
						part[nutrient] *= multiplier*percent;
					});
				});

				// Sum up each part to produce the final blend
				return ingredient.reduce(function(blend, part) {
					percent = part.percent/100;

					pricePerGram = part.item_cost/part.container_size;

					blend.name += " & "+part.name+" ("+part.percent+"%)";
					blend.serving += part.serving;
					blend.container_size = max_container_size;
					blend.item_cost += pricePerGram*percent*max_container_size;

					nutrients.forEach(function(nutrient) {
						blend[nutrient] += part[nutrient];
					});
					return blend;
				});
			}
		} else {
			return ingredient;
		}
	});

	function updateRatios(dontUpdateSlider) {
		var carb = sliderMin,
			protein = (sliderMax - sliderMin),
			fat = (100 - sliderMax),
			calories = Number($('#cal').val());

		$('.custom-carb').val(carb);
		$('.custom-protein').val(protein);
		$('.custom-fat').val(fat);

		if (!dontUpdateSlider) {
			$('#slider-range').slider('setValue', [sliderMin, sliderMax]);
		}

		$('.carb-user-pct').html(carb + '%');
		$('.protein-user-pct').html(protein + '%');
		$('.fat-user-pct').html(fat + '%');

		$('#carb_cal').html(Math.round(carb * calories / 100) + ' cals');
		$('#protein_cal').html(Math.round(protein * calories / 100) + ' cals');
		$('#fat_cal').html(Math.round(fat * calories / 100) + ' cals');

		var carbG = Math.round(carb * calories / 100 / 4);
		var proteinG = Math.round(protein * calories / 100 / 4);
		var fatG = Math.round(fat * calories / 100 / 9);

		$('#carb_g').html(carbG + ' g');
		$('#protein_g').html(proteinG + ' g');
		$('#fat_g').html(fatG + ' g');

		saveFormValues();

		// Calculate Recipe Every Second
		setTimeout(function () {
			calculateRecipe(calories, carb, protein, fat);
		}, 1000);
	}

	function calculateRecipe(calories, carbs, protein, fat) {
		var macros = {
			carbs: carbs,
			protein: protein,
			fat: fat
		}

		var ingredientLength,
			targetLength, // Length of ingredient and target array (also dimensions of m)
			M,            // Matrix mapping ingredient amounts to chemical amounts (values are fraction per serving of target value)
			cost,         // Cost of each ingredient per serving
			w = .0001,    // Weight cost regularization (creates sparse recipes for large numbers of ingredient, use 0 for few ingredients)
			maxPerMin,    // Ratio of maximum value to taget value for each ingredient
			lowWeight,
			highWeight;   // How to weight penalties for going over or under a requirement

		// Different ingredients depend on user preferences

		// Add Olive Oil if user wants >=60% calories from fat
		//if(macros.fat < 60) ingredients.shift();

		// Override macros based on user variables from top of this file
		nutrientTargets.calories = calories;
		nutrientTargets.carbs    = Math.round(macros.carbs * calories / 100 / 4);
		nutrientTargets.protein  = Math.round(macros.protein * calories / 100 / 4);
		nutrientTargets.fat      = Math.round(macros.fat * calories / 100 / 9);
		nutrientTargets.fiber    = Math.round(calories/1000.0 * 15.0);
		nutrientTargets.fiber_max    = Math.round(calories/1000.0 * 18.0);
		nutrientTargets.stevia       = Math.round(calories/1000.0 * 3.0);
		nutrientTargets.stevia_max   = Math.round(calories/1000.0 * 6.0);
		nutrientTargets.calories_max = Number((nutrientTargets.calories * 1.04).toFixed(2));
		nutrientTargets.carbs_max    = Number((nutrientTargets.carbs * 1.04).toFixed(2));
		nutrientTargets.protein_max  = Number((nutrientTargets.protein * 1.04).toFixed(2));
		nutrientTargets.fat_max      = Number((nutrientTargets.fat * 1.04).toFixed(2));
		if ($('select[name=sex]').val() == "f") nutrientTargets.iron = 18;

		/**
		 * Fitness function that is being optimized
		 *
		 * Note: target values are assumed as 1 meaning M amounts are normalized to be fractions of target values does not
		 * consider constraints, those are managed elsewhere.
		 *
		 * Based on the formula (M * x-1)^2 + w *(x dot c) except that penalties are only given if above max or below min and
		 * quadratically from that point.
		 *
		 * @author Alrecenk (Matt McDaniel) of Inductive Bias LLC (www.inductivebias.com) March 2014
		 */
		function f(x) {
			var output = createArray(targetLength),
				totalError = 0;

			// M*x - 1
			for (var t = 0; t < targetLength; t++) {
				// Calculate output
				output[t] = 0;

				// Calculate total mass
				for (var i = 0; i < ingredientLength; i++) {
					output[t] += M[i][t] * x[i];
					//console.log("output:["+t+"]"+output[t]);
				}
				// If too low penalize with low weight
				if (output[t] < 1) {
					totalError += lowWeight[t] * (1 - output[t]) * (1 - output[t]);
				}
				else if (output[t] > maxPerMin[t]) { // If too high penalize with high weight
					totalError += highWeight[t] * (maxPerMin[t] - output[t]) * (maxPerMin[t] - output[t]);
				}
				/*if (t == 20) {
					if(output[t] < output[t+1]) {
						totalError += 10000*(output[t+1] - output[t]) * (output[t+1] - output[t]);
					} else if(output[t] > output[t+1]) {
						totalError += (output[t+1] - output[t]) * (output[t+1] - output[t]);
					}
				}*/
			}

			// Calculate cost penalty, |c*x|
			// but X is nonnegative so absolute values aren't necessary
			var penalty = 0;
			var mass = 0;
			for (var i = 0; i < ingredientLength; i++) {
				penalty += cost[i] * x[i];
				mass += x[i];
			}
			totalMass = mass.toFixed(2);

			// Increase error for not meeting a certain ratio requirement
			for (var i = 0; i < ingredientLength; i++) {
				if (x[i] < minRatio[i]*mass) {
					totalError += (minRatio[i]*mass - x[i])*(minRatio[i]*mass - x[i]);
				}
				else if (x[i] > maxRatio[i]*mass) {
					totalError += (maxRatio[i]*mass - x[i])*(maxRatio[i]*mass - x[i]);
				}
			}

			return totalError + w * penalty;
		}

		/**
		 * Gradient of f with respect to x.
		 * Based on the formula 2 M^T(Mx-1) + wc except with separate parabolas for going over or under.
		 * Does not consdier constraints, those are managed elsewhere.
		 *
		 * @author Alrecenk (Matt McDaniel) of Inductive Bias LLC (www.inductivebias.com) March 2014
		 */
		function gradient(x){

			var output = createArray(targetLength);

			// output = M*x
			for (var t = 0; t < targetLength; t++) {
				// Calculate output
				output[t] = 0;
				for (var i = 0; i < ingredientLength; i++) {
					output[t] += M[i][t] * x[i];
				}
			}

			// Initialize gradient
			var dx = [];
			for (var i = 0; i < ingredientLength; i++) {
				dx[i] = 0;
				for (var t = 0; t < targetLength; t++) {
					// M^t (error)
					if (output[t] < 1) { // If output too low calculate gradient from low parabola
						dx[i] += lowWeight[t] * M[i][t] * (output[t] - 1);
					}
					else if (output[t] > maxPerMin[t]) { // If output too high calculate gradient from high parabola
						dx[i] += highWeight[t] * M[i][t] * (output[t] - maxPerMin[t]);
					}
					/*if (t == 20) {
						if (output[t] < output[t+1]) {
							dx[i] += 10000*M[i][t] * (output[t] - output[t+1]);
						} else if(output[t] > output[t+1]) {
							dx[i] += M[i][t] * (output[t] - output[t+1]);
						}
					}*/
				}
				
				dx[i] += cost[i] * w; // + c w
			}

			var mass = 0;
			for (var i = 0; i < ingredientLength; i++) {
				mass += x[i];
			}

			for (var i = 0; i < ingredientLength; i++) {
				if (x[i] < minRatio[i]*mass) { // If ingredient's mass too low calculate gradient from low parabola
					dx[i] += (x[i] - minRatio[i]*mass);
				}
				else if (x[i] > maxRatio[i]*mass) { // If ingredient's mass too high calculate gradient from high parabola
					dx[i] += (x[i] - maxRatio[i]*mass);
				}
			}

			return dx;
		}

		/**
		 * Generates a recipe based on gradient descent minimzation of a fitness function cosisting of half parabola penalties
		 * for out of range items and weighted monetary cost minimzation.
		 *
		 * @author Alrecenk (Matt McDaniel) of Inductive Bias LLC (www.inductivebias.com) March 2014
		 */
		function generateRecipe(ingredients, nutrientTargets) {
			// Initialize our return object: an array of ingredient quantities (in the same order the ingredients are passed in)
			var ingredientQuantities = [],
				targetAmount = [], // Target amounts used to convert ingredient amounts to per serving ratios
				targetName = [],
				x = []; // Number of servings of each ingredient

			var multiplier = ($('#cal').val() < getCaloriesFromInfo() && $('#cal').val() != 0) ? ($('#cal').val()/getCaloriesFromInfo()) : 1;

			// Fetch the target values ignoring the "max" values and any nonnumerical variables
			for (var key in nutrientTargets) {
				var name = key,
					nutrient = name.replace(/_max$/, '')
					value = nutrientTargets[key];

				if (nutrients.indexOf(nutrient) > -1 && name.substring(name.length - 4, name.length) != "_max" && value > 0) {
					targetName.push(name);
					if (macroNutrients.indexOf(name) >= 0) {
						targetAmount.push(value);
					} else {
						targetAmount.push(multiplier*value);
					}
				}
			}

			maxPerMin = [];
			lowWeight = [];
			highWeight = [];

			// Initialize target amount maxes and mins along with weights.
			// There are some hardcoded rules that should be made configurable in the future.
			for (var t = 0; t < targetAmount.length; t++) {
				// If has a max for this element
				if (nutrientTargets[targetName[t] + "_max"] > targetAmount[t]) {
					var maxvalue = nutrientTargets[targetName[t] + "_max"];
					if (macroNutrients.indexOf(targetName[t]) >= 0) {
						maxPerMin[t] = (maxvalue) / targetAmount[t];
					} else {
						maxPerMin[t] = (multiplier*maxvalue) / targetAmount[t];
					}
				}
				else {
					maxPerMin[t] = 1000; // Max is super high for things that aren't limited
				}

				// Weight macro nutrients values higher and make sure we penalize for going over (ad hoc common sense rule)
				if (macroNutrients.indexOf(targetName[t]) >= 0) {
					// Gain weight quickly
					if (goal == 1.25) {
						lowWeight[t] = 30000;
						highWeight[t] = 10000;
					// Gain weight steadily
					} else if (goal == 1.15) {
						lowWeight[t] = 20000;
						highWeight[t] = 10000;
					// Lose weight steadily
					} else if (goal == 0.85) {
						lowWeight[t] = 10000;
						highWeight[t] = 20000;
					// Lose weight quickly
					} else if (goal == 0.75) {
						lowWeight[t] = 10000;
						highWeight[t] = 30000;
					// Maintain weight or other
					} else {
						lowWeight[t] = 10000;
						highWeight[t] = 10000;
					}

					// More importance is given to calories over protein, carbs, and fat
					if (targetName[t] == "calories") {
						lowWeight[t] *= 10;
						highWeight[t] *= 10;
					}

					maxPerMin[t] = 1;
				}
				else {
					lowWeight[t] = 200;
					highWeight[t] = 100;
				}

				if (targetName[t] == "omega_6") {
					lowWeight[t] = 20;
					highWeight[t] = 1000;
				}

				// console.log(targetName[t] + " : " + targetAmount[t] +" --max ratio :" + maxPerMin[t] +" weights :" + lowWeight[t]+"," + highWeight[t]);
			}

			// Intitialize the matrix mapping ingredients to chemicals and the cost weights.
			// These are the constants necessary to evaluate the fitness function and gradient.

			ingredientLength = ingredients.length;
			targetLength = targetAmount.length;
			M = createArray(ingredientLength, targetLength);
			cost = [];

			for (var i = 0; i < ingredients.length; i++) {
				for (var t = 0; t < targetAmount.length; t++) {
					// Fraction of daily value of target t in ingredient i
					M[i][t] = ingredients[i][targetName[t]] / (targetAmount[t]);
				}

				// Initial x doesn't affect result but a good guess may improve speed
				x[i] = 1; // Initialize with one of everything

				// Cost per serving is cost per container * servings per container
				cost[i] = ingredients[i].item_cost * ingredients[i].serving / ingredients[i].container_size;
			}

			// Projected Gradient descent with halving step size, accepting largest step with improvement.
			// Could be made faster by moving to LBGS and implementing a proper inexact line search
			// but this method does guarantee convergence so those improvements are on the back burner
			//console.log("Calculating Optimal Recipe...");

			var fv = f(x),
				g = gradient(x),
				chunk = 100;
				iteration = 0;

			// Doing linesearch in chunks of 100 prevents browser from freezing
			function doChunk() {
				var cnt = chunk;
				while (cnt-- && !done && iteration < 500000) { // Loops until no improvement can be made or max iterations
					if(iteration % 10000 == 0) {
						setTimeout(function() {}, 1); 
					}

					iteration++;

					var done = false,
						stepsize = 10, // Start with big step
						linesearch = true;

					while (linesearch) {
						var newx = [];

						// Calculate new potential value
						for (var i = 0; i < x.length; i++) {
							newx[i] = x[i] - g[i] * stepsize;
							if (newx[i] < 0) {
								newx[i] = 0;
							}
						}

						var newf = f(newx); // Get fitness
						if (newf < fv) {    // If improvement then accept and recalculate gradient
							fv = newf;
							x = newx;
							g = gradient(x);
							linesearch = false; // exit line search
						}
						else {
							stepsize *= 0.5; // If bad then halve step size
							if (stepsize < 0.00000001) { // If stepsize too small then quit search entirely
								done = true;
								linesearch = false;
							}
							else { // otherwise continue line search
								linesearch = true;
							}
						}
					}
				}
				if(!done && iteration < 500000) {
					setTimeout(doChunk, 1);
				}
			}
			doChunk();

			var pricePerMeal = 0;
			var mass = 0;
			for (var k = 0; k < x.length; k++) {
				if(ingredients[k].name == "MK-7 Vitamin K-2") {
					//x[k] = Math.ceil(x[k]); 
				}
				pricePerMeal += x[k] * cost[k];
				mass += x[k] * ingredients[k].serving;
			}
			var packaging = 0.2;
			pricePerMeal += packaging;
			costPerShake = pricePerMeal.toFixed(2);

			var markup = 1.45;
			var boxQuantity = parseInt($('select[name=quantity]').val());
			// Give discount for ordering more packs
			markup -= (boxQuantity/6-1)*0.05;

			var finalPrice = pricePerMeal*markup;

			$(".mass").html(Math.round(mass));

			$(".meal-price").html(finalPrice.toFixed(2));

			$(".quantity_u").html(boxQuantity);
			$(".box-price").html((boxQuantity*finalPrice).toFixed(2));

			// Map number of servings into raw quantities because that's what this function is supposed to return
			for (var i = 0; i < ingredients.length; i++) {
				ingredientQuantities[i] = Math.ceil(x[i] * ingredients[i].serving);
			}

			return ingredientQuantities;
		}

		// Convenience function for preinitializing arrays because I'm not accustomed to working on javascript
		function createArray(length) {
			var arr = new Array(length || 0),
				i = length;

			if (arguments.length > 1) {
				var args = Array.prototype.slice.call(arguments, 1);
				while(i--) arr[length-1 - i] = createArray.apply(this, args);
			}

			return arr;
		}

		// We need to make a deep copy of ingredients list for modification based on user preferences
		var ingredientsCopy = JSON.parse(JSON.stringify(ingredients));
		// Use different Vitamin/Mineral Blend depending on sex
		if ($('select[name=sex]').val() == "f") {
			ingredientsCopy = ingredientsCopy.filter(function(ing) {return ing.name !== "GNC Mega Men® Sport";});
		} else {
			ingredientsCopy = ingredientsCopy.filter(function(ing) {return ing.name !== "GNC Women's Ultra Mega® Active Sport";});
		}
		console.log(ingredientsCopy);

		// Here's where the magic happens...
		var ingredientQuantities = generateRecipe(ingredientsCopy, nutrientTargets);

		// clear these lists
		finalIngredientsList = [];
		finalIngredientsQuantityList = [];
		finalRecipe = {};

		finalIngredientsList = (ingredientsCopy.map(function(ingredient) {return ingredient.name}));
		finalIngredientsQuantityList = (ingredientQuantities.map(function(ingredient) {return ingredient}));
		for(var i = 0; i < finalIngredientsList.length; i++){
			var key = finalIngredientsList[i];
			// Reduce key length to 40 because this is the maximum of Stripe
			if (key.length >= 40) key = finalIngredientsList[i].substring(0,35)+'...';
			finalRecipe[key] = finalIngredientsQuantityList[i]*2;
		}
		//console.log(finalRecipe);

		var pct;

		for (var n=0; n < nutrients.length; n++) {

				var nutrient = nutrients[n];

				// Add up the amount of the current nutrient in each of the ingredients.
				var nutrientInIngredients = 0;
				for (j=0; j< ingredientsCopy.length; j++) {
					if (typeof ingredientsCopy[j][nutrient] == 'number' && ingredientQuantities[j] > 0) {
						nutrientInIngredients += ingredientsCopy[j][nutrient] * ingredientQuantities[j] / ingredientsCopy[j].serving;
					}
				}

				// Format percentages nicely. Cyan: too little. Green: just right. Red: too much
				pct = nutrientTargets[nutrient] ? (nutrientInIngredients / nutrientTargets[nutrient] * 100) : 100;
				if (nutrientTargets[nutrient + '_max'] > 0 && nutrientInIngredients > nutrientTargets[nutrient + '_max']) {
					pct = nutrientTargets[nutrient + '_max'] ? (nutrientInIngredients / nutrientTargets[nutrient + '_max'] * 100) : 100;
				}

				$("."+nutrient+"_u").html(parseInt(nutrientInIngredients));
				$("."+nutrient+"_pct").html(parseInt(pct));

				/*nutrientsTable.push([
					nutrient || '',                           // Nutrient Name
					nutrientTargets[nutrient] || '',          // Target amount
					nutrientTargets[nutrient + '_max'] || '', // Maximum amount
					nutrientInIngredients.toFixed(2) || '',   // Amount in Recipe
					pct || ''                                 // % of Target in recipe
				]);*/
		}
	}

	$("#slider-range").slider({
		min: 0,
		max: 100,
		step: 1,
		value: [50, 75],
		tooltip: 'hide'
	});
	$("#slider-range").on('slide', function(e) {
		sliderMin = e.value[0];
		sliderMax = e.value[1];
		updateRatios(true);
	})
	$("#slider-range").on('slideStart', function(e) {
		$('select[name=ratios] option[value=custom]').prop('selected', true);
	})

	function saveFormValues() {
		var formValues = {
			quantity: $('select[name=quantity]').val(),
			age: $('input[name=age]').val(),
			height: $('select[name=height]').val(),
			sex: $('select[name=sex]').val(),
			weight: $('input[name=weight]').val(),
			exercise: $('select[name=exercise]').val(),
			goal: $('select[name=goal]').val(),
			weightMeasurement: $('select[name=weightMeasurement]').val(),
			ratios: $('select[name=ratios]').val(),
			sliderMin: sliderMin,
			sliderMax: sliderMax
		}

		if (window.localStorage) {
			window.localStorage.nutrientCalc = JSON.stringify(formValues);
		}

		return formValues;
	}

	function getCaloriesFromInfo() {
		var formValues = saveFormValues();

		var age = Number(formValues.age) || 24,
			height = Number(formValues.height),
			sex = formValues.sex,
			weightLbs = (Number(formValues.weight) || 145),
			weightMeasurement = formValues.weightMeasurement;
			weight = weightLbs * (weightMeasurement == 'lbs' ? 0.453592 : 1),
			exercise = Number(formValues.exercise),
			goal = Number(formValues.goal),
			lowest = 8 * weightLbs;

		var calories = (10 * weight) + (6.25 * height) - (5 * age);
		if (sex == 'm') {
			calories += 5;
		} else {
			calories -= 161;
		}
		calories = Math.round(calories * exercise * goal);
		//console.log(age, height, sex, weight, exercise, goal, weightMeasurement, calories);
		return calories < lowest ? lowest : calories;
	}

	function recalc() {
		var calories = getCaloriesFromInfo();
		var meals = Number($('#meals').val());
		if (meals > 0) calories = parseInt(calories/meals);

		$('#cal').val(calories);
		updateRatios();
		resizeForText.call($('.resizing-input input'), $('.resizing-input input').val());
	}

	var onFormChange = function() {
		mixpanel.track("Form edit");
		recalc();
	}
	$('.calc').on('change', onFormChange);
	$('.calc').on('keyup', onFormChange);

	//$('#cal').on('change', updateRatios);
	$('select[name=quantity]').on('change', updateRatios);
	$('#cal').on('keyup', updateRatios);

	if (window.localStorage && window.localStorage.nutrientCalc) {
		try {
			var formValues = JSON.parse(window.localStorage.nutrientCalc);
			if (formValues.age) $('input[name=age]').val(formValues.age);
			if (formValues.height) $('select[name=height]').val(formValues.height);
			if (formValues.sex) $('select[name=sex]').val(formValues.sex);
			if (formValues.weight) $('input[name=weight]').val(formValues.weight);
			if (formValues.exercise) $('select[name=exercise]').val(formValues.exercise);
			if (formValues.goal) $('select[name=goal]').val(formValues.goal);
			if (formValues.weightMeasurement) $('select[name=weightMeasurement]').val(formValues.weightMeasurement);
			//weightMeasurement = formValues.weightMeasurement;
			if (formValues.sliderMin) {
				sliderMin = formValues.sliderMin;
				$('.custom-carb').val(sliderMin);
			}
			if (formValues.sliderMax) {
				sliderMax = formValues.sliderMax;
				$('.custom-protein').val(Number(sliderMax) - Number(sliderMin));
				$('.custom-fat').val(100 - Number(sliderMax));
			}
			if (formValues.ratios) {
				$('select[name="ratios"]').val(formValues.ratios);
			}
		} catch (e) {}
	}

	function updateRatioSelect() {
		var val = $('select[name=ratios]').val(),
			vals = val.split('-');

		if (val == 'custom') {
			$('.custom-ratios, .custom-calories-results').hide();
			$('.slider, .calories-results').show();
		} else if (val == 'customType') {
			$('.custom-ratios, .custom-calories-results').show();
			$('.slider, .calories-results').hide();
		}
		if (vals[0] && vals[1]) {
			$('.custom-ratios, .custom-calories-results').hide();
			$('.slider, .calories-results').show();
			sliderMin = Number(vals[0]);
			sliderMax = sliderMin + Number(vals[1]);
			updateRatios();
		}
	}

	$('select[name=ratios]').change(updateRatioSelect);

	recalc();
	updateRatioSelect();

	/*$(document).on('click', '.weight-measurement .btn', function() {
		weightMeasurement = $(this).find('input').val();
		recalc();
	});*/

	$(document).on('keyup', '#cal-custom, .custom-carb, .custom-protein, .custom-fat', function() {
		updateRatios();
	});

	// Adjust size of calories textbox depending on input
	var $inputs = $('.resizing-input');

	// Resize based on text if text.length > 0
	// Otherwise resize based on the placeholder
	function resizeForText(text) {
		var $this = $(this);
		if (!text.trim()) {
			text = $this.attr('value').trim();
		}
		var $span = $this.parent().find('span');
		$span.text(text);
		var $inputSize = $span.width()+13.5;
		$this.css("width", $inputSize);
	}

	$inputs.find('input').keypress(function(e) {
		if (e.which && e.charCode) {
			var c = String.fromCharCode(e.keyCode | e.charCode);
			var $this = $(this);
			if($this.val().length >= 4) return;
			resizeForText.call($this, $this.val() + c);
		}
	});

	// Backspace event only fires for keyup
	$inputs.find('input').keyup(function(e) {
		if (e.keyCode === 8 || e.keyCode === 46) {
			resizeForText.call($(this), $(this).val());
		}
	});

	$inputs.find('input').each(function() {
		var $this = $(this);
		resizeForText.call($this, $this.val())
	});

	// Handles Stripe checkout
	//chargeRequest.metadata = formValues;
	var handler = StripeCheckout.configure({
		key: 'pk_live_ECxRJzIfpdaZa3mOKwjRYwgh',
		locale: 'auto',
		shippingAddress: true,
		zipCode: true,
		token: function(token) {
		// You can access the token ID with `token.id`.
		// Get the token ID to your server-side code for use.
			//jQuery.extend(chargeRequest, token);
			//console.log(chargeRequest);
			var chargeRequest = {
				name: 'Fitro',
				description: $('select[name=quantity]').val()+' Meal Packets ('+$(".calories_u:eq(0)").text()+' calories each)',
				amount: Number($(".box-price").text())*100
			};
			var formValues = saveFormValues();
			delete formValues["sliderMin"];
			delete formValues["sliderMax"];
			delete formValues["ratios"];
			var metadata = {};
			metadata.costPerShake = costPerShake;
			metadata.totalMass = totalMass;		
			jQuery.extend(metadata,finalRecipe);
			jQuery.extend(metadata,formValues);
			jQuery.extend(chargeRequest,token);
			chargeRequest.metadata = metadata;
			//document.write(JSON.stringify(chargeRequest));
			
			jQuery.ajax({
				type: 'POST',
				contentType: 'application/json',
				url: 'https://wt-d6cf833b659f32f492aa90963e6050d4-0.run.webtask.io/webtask-stripe-charge',
				data: JSON.stringify(chargeRequest),
				success: function(result) {
					alert("Thank you for ordering Fitro! We'll email your order details soon.");
				},
				error: function(xhr,status,error) {
					alert("Something went wrong with your order! Try again.");
				}
			});
		}
	});

	document.getElementById('order').addEventListener('click', function(e) {
		mixpanel.track("Order click");
		if (costPerShake != -1 && totalMass != -1) {
			// Open Checkout with further options:
			handler.open({
				name: 'Fitro',
				description: $('select[name=quantity]').val()+' Meal Packs ('+$(".calories_u:eq(0)").text()+' calories each)',
				amount: Number($(".box-price").text())*100
			});
			e.preventDefault();
		}
	});
});