"""Condition Evaluator - Safe evaluation of transition conditions"""
from typing import Any, Dict, Optional

from ..domain.models import ConditionGroup, Condition
from ..domain.enums import ConditionOperator
from ..utils.logger import get_logger

logger = get_logger(__name__)


class ConditionEvaluator:
    """
    Evaluate transition conditions safely
    
    Uses a simple DSL - no eval() or exec().
    """
    
    def evaluate(
        self,
        condition_group: ConditionGroup,
        context: Dict[str, Any]
    ) -> bool:
        """
        Evaluate a condition group
        
        Args:
            condition_group: Group of conditions with AND/OR logic
            context: Context with field values
            
        Returns:
            True if conditions are met
        """
        if not condition_group.conditions:
            return True  # No conditions = always true
        
        results = []
        for condition in condition_group.conditions:
            result = self._evaluate_single(condition, context)
            results.append(result)
        
        if condition_group.logic.upper() == "OR":
            return any(results)
        else:  # AND (default)
            return all(results)
    
    def _evaluate_single(
        self,
        condition: Condition,
        context: Dict[str, Any]
    ) -> bool:
        """Evaluate a single condition"""
        try:
            # Get field value from context
            field_value = self._get_field_value(condition.field, context)
            compare_value = condition.value
            operator = condition.operator
            
            return self._compare(field_value, operator, compare_value)
            
        except Exception as e:
            logger.warning(f"Condition evaluation failed: {e}")
            return False  # Fail closed
    
    def _get_field_value(self, field_path: str, context: Dict[str, Any]) -> Any:
        """
        Get field value from context using dot notation
        
        Example: "form_values.amount" -> context["form_values"]["amount"]
        """
        parts = field_path.split(".")
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None
        
        return value
    
    def _compare(
        self,
        field_value: Any,
        operator: ConditionOperator,
        compare_value: Any
    ) -> bool:
        """Compare values using operator"""
        
        if operator == ConditionOperator.EQUALS:
            return field_value == compare_value
        
        elif operator == ConditionOperator.NOT_EQUALS:
            return field_value != compare_value
        
        elif operator == ConditionOperator.GREATER_THAN:
            return self._compare_numeric(field_value, compare_value, lambda a, b: a > b)
        
        elif operator == ConditionOperator.LESS_THAN:
            return self._compare_numeric(field_value, compare_value, lambda a, b: a < b)
        
        elif operator == ConditionOperator.GREATER_THAN_OR_EQUALS:
            return self._compare_numeric(field_value, compare_value, lambda a, b: a >= b)
        
        elif operator == ConditionOperator.LESS_THAN_OR_EQUALS:
            return self._compare_numeric(field_value, compare_value, lambda a, b: a <= b)
        
        elif operator == ConditionOperator.CONTAINS:
            if field_value is None:
                return False
            return str(compare_value) in str(field_value)
        
        elif operator == ConditionOperator.NOT_CONTAINS:
            if field_value is None:
                return True
            return str(compare_value) not in str(field_value)
        
        elif operator == ConditionOperator.IN:
            if not isinstance(compare_value, list):
                compare_value = [compare_value]
            return field_value in compare_value
        
        elif operator == ConditionOperator.NOT_IN:
            if not isinstance(compare_value, list):
                compare_value = [compare_value]
            return field_value not in compare_value
        
        elif operator == ConditionOperator.IS_EMPTY:
            return field_value is None or field_value == "" or field_value == []
        
        elif operator == ConditionOperator.IS_NOT_EMPTY:
            return field_value is not None and field_value != "" and field_value != []
        
        return False
    
    def _compare_numeric(
        self,
        field_value: Any,
        compare_value: Any,
        comparator
    ) -> bool:
        """Compare numeric values"""
        try:
            a = float(field_value) if field_value is not None else 0
            b = float(compare_value) if compare_value is not None else 0
            return comparator(a, b)
        except (ValueError, TypeError):
            return False

