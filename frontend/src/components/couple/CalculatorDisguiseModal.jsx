import React, { useState, useEffect, useRef } from 'react';
import './CoupleFeatures.css';

/**
 * Calculator Disguise Screen
 * Looks and calculates identically to a real phone calculator.
 * Entering secret PIN (default: 143=) unlocks the secret couple chat.
 * Entering decoy PIN (default: 0000=) triggers Decoy Mode.
 */
export default function CalculatorDisguiseModal({ isOpen = true, onClose, onUnlock, onDecoyUnlock, onTriggerDecoy }) {
    const [display, setDisplay] = useState('0');
    const [prevValue, setPrevValue] = useState(null);
    const [operation, setOperation] = useState(null);
    const [waitingForOperand, setWaitingForOperand] = useState(false);
    const [secretInputHistory, setSecretInputHistory] = useState('');

    useEffect(() => {
        if (isOpen) {
            setDisplay('0');
            setPrevValue(null);
            setOperation(null);
            setWaitingForOperand(false);
            setSecretInputHistory('');
        }
    }, [isOpen]);

    if (isOpen === false) return null;

    const handleDigit = (digit) => {
        setSecretInputHistory(prev => (prev + digit).slice(-12));

        if (waitingForOperand) {
            setDisplay(String(digit));
            setWaitingForOperand(false);
        } else {
            setDisplay(display === '0' ? String(digit) : display + digit);
        }
    };

    const handleDot = () => {
        setSecretInputHistory(prev => (prev + '.').slice(-12));
        if (waitingForOperand) {
            setDisplay('0.');
            setWaitingForOperand(false);
        } else if (!display.includes('.')) {
            setDisplay(display + '.');
        }
    };

    const handleClear = () => {
        setDisplay('0');
        setPrevValue(null);
        setOperation(null);
        setWaitingForOperand(false);
        setSecretInputHistory('');
    };

    const handleToggleSign = () => {
        const val = parseFloat(display);
        if (!isNaN(val)) {
            setDisplay(String(-val));
        }
    };

    const handlePercent = () => {
        const val = parseFloat(display);
        if (!isNaN(val)) {
            setDisplay(String(val / 100));
        }
    };

    const handleOperator = (op) => {
        const inputValue = parseFloat(display);

        if (prevValue == null) {
            setPrevValue(inputValue);
        } else if (operation) {
            const current = prevValue || 0;
            const res = performCalculation(operation, current, inputValue);
            setPrevValue(res);
            setDisplay(String(res));
        }

        setWaitingForOperand(true);
        setOperation(op);
    };

    const performCalculation = (op, prev, next) => {
        switch (op) {
            case '+': return prev + next;
            case '-': return prev - next;
            case '×': return prev * next;
            case '÷': return next === 0 ? 'Error' : prev / next;
            default: return next;
        }
    };

    const handleEquals = () => {
        const fullSecret = secretInputHistory + '=';

        // Check for Secret Couple Unlock PIN: "143=" or "9999="
        if (fullSecret.includes('143=') || fullSecret.includes('9999=')) {
            if (typeof onUnlock === 'function') onUnlock();
            else if (typeof onClose === 'function') onClose();
            return;
        }

        // Check for Decoy PIN: "0000="
        if (fullSecret.includes('0000=')) {
            if (typeof onTriggerDecoy === 'function') onTriggerDecoy();
            else if (typeof onDecoyUnlock === 'function') onDecoyUnlock();
            return;
        }

        const inputValue = parseFloat(display);
        if (operation && prevValue != null) {
            const res = performCalculation(operation, prevValue, inputValue);
            setDisplay(String(res));
            setPrevValue(null);
            setOperation(null);
            setWaitingForOperand(true);
        }
    };

    return (
        <div className="calculator-overlay">
            <div className="calculator-container">
                {/* Result Display Screen */}
                <div className="calculator-screen">
                    {display}
                </div>

                {/* Keypad */}
                <div className="calculator-grid">
                    <button className="calc-btn calc-btn-gray" onClick={handleClear}>AC</button>
                    <button className="calc-btn calc-btn-gray" onClick={handleToggleSign}>±</button>
                    <button className="calc-btn calc-btn-gray" onClick={handlePercent}>%</button>
                    <button className="calc-btn calc-btn-orange" onClick={() => handleOperator('÷')}>÷</button>

                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('7')}>7</button>
                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('8')}>8</button>
                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('9')}>9</button>
                    <button className="calc-btn calc-btn-orange" onClick={() => handleOperator('×')}>×</button>

                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('4')}>4</button>
                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('5')}>5</button>
                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('6')}>6</button>
                    <button className="calc-btn calc-btn-orange" onClick={() => handleOperator('-')}>-</button>

                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('1')}>1</button>
                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('2')}>2</button>
                    <button className="calc-btn calc-btn-dark" onClick={() => handleDigit('3')}>3</button>
                    <button className="calc-btn calc-btn-orange" onClick={() => handleOperator('+')}>+</button>

                    <button className="calc-btn calc-btn-dark calc-btn-zero" onClick={() => handleDigit('0')}>0</button>
                    <button className="calc-btn calc-btn-dark" onClick={handleDot}>.</button>
                    <button className="calc-btn calc-btn-orange" onClick={handleEquals}>=</button>
                </div>
            </div>
        </div>
    );
}
