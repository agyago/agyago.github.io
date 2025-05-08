---
layout: post
description: Python Crash Course basics
tags: python
---

# BASICS
**Problem Solving!**

When I was starting, my initial thinking was to jump in to know the syntax and memorize all the things/gotcha that I should know in a programming/scripting language.
But I was wrong, first is to understand the problem that I need to solve. Of course syntax are important but understanding the problem is very important to learn before jumping into coding

*tips*
1. Gather as much information:
    - Learn the issue well (clear description of the problem)
    - The required Input and expected Output
    - Try brute force
2. Root cause (if any)
3. check if there is any workaround/alternatives or someone have solved it (if any)

Once the problem is understood:

1. Draw it in a piece of paper. Think of a flow chart
2. express it in words on how will the script work. (like a cookbook recipe)

---

With that here are the basics of Python.

## Python Data Types

| Type | Example | Description |
|------|---------|-------------|
| `int` | `5`, `-42` | Whole numbers |
| `float` | `3.14`, `-0.5` | Decimal numbers |
| `str` | `"hello"` | Text values |
| `bool` | `True`, `False` | Boolean values |
| `list` | `[1, 2, 3]` | Ordered, mutable collection |
| `dict` | `{"a": 1}` | Key-value pairs |
| `None` | `None` | Represents no value |

## Variables
```python
x = 10
name = "Amy"
pi = 3.14
```

**Remember:** Variable names must start with a letter or underscore and cannot be Python keywords (like `if`, `for`).

## Arithmetic Operations

| Operation | Symbol | Example | Result |
|-----------|--------|---------|--------|
| Addition | `+` | `2 + 3` | `5` |
| Subtraction | `-` | `5 - 2` | `3` |
| Multiplication | `*` | `3 * 4` | `12` |
| Division | `/` | `10 / 2` | `5.0` |
| Modulus | `%` | `10 % 3` | `1` |
| Exponent | `**` | `2 ** 3` | `8` |
| Floor Division | `//` | `10 // 3` | `3` |

```python
print(3 + 4)
print(10 % 3)
print(2 ** 4)
```

**Remember:** Use `//` for integer division, and `/` for float division.

## Strings
```python
name = "Alice"
print("Hello, " + name)
print(f"Hello, {name}")
print("Length:", len(name))

word = "Python"
print(word[0])     # P
print(word[-1])    # n
print(word[0:2])   # Py
```

## Lists
```python
fruits = ["apple", "banana", "cherry"]
print(fruits[1])         # banana
fruits.append("date")    # add item
fruits.remove("apple")   # remove item
```

**Remember:** Use `append()` to add, `pop()` to remove by index, or `remove()` by value.

## Dictionaries
```python
person = {"name": "John", "age": 30}
print(person["name"])
person["age"] = 31
person["job"] = "Engineer"
```

**Remember:** Keys must be unique. They're usually strings or numbers.

## Conditionals
```python
age = 18
if age >= 18:
    print("Adult")
elif age > 12:
    print("Teenager")
else:
    print("Child")
```

**Remember:** Indentation is mandatory in Python. Use `and`, `or`, `not` for logic.

## Boolean Logic
```python
is_raining = True
is_cold = False

if is_raining and not is_cold:
    print("Take umbrella, no coat.")
```

## None
```python
result = None
if result is None:
    print("No result yet.")
```

## Type Checking and Conversion
```python
x = "123"
print(type(x))         # <class 'str'>
y = int(x)
print(type(y))         # <class 'int'>
```

## Final Tips
- Use `type()` to check the data type.
- Use `print()` to debug.
- Explore with `dir()` and `help()`.

```python
print(dir(str))
help(str.upper)
```

## Quick Summary

| Concept | Example | Notes |
|---------|---------|-------|
| Variable | `x = 5` | Dynamic typing |
| String | `f"Hello, {name}"` | Use f-strings |
| List | `append()` | Ordered, mutable |
| Dict | `{"a": 1}` | Key-value store |
| If-Else | `if age >= 18` | Use indentation |
| Arithmetic | `**, //, %` | Power, floor division |
| Boolean | `True / False` | Use `is` for `None` |

