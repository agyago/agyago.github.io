---
layout: post
description: Python Crash Course basics
tags: python
---

# BASICS
**Problem Solving!**

When I was starting, my initial thinking was to jump in to know the syntax and memorize all the things/gotcha that I should know in a programming/scripting language.
But I was wrong, first is to understand the problem that I need to solve. Ofcourse syntax are important but understanding the problem is very important to learn before jumping into coding

*tips*
1. Gather as much information:
    - Learn the issue well (clear description of the problem)
    - The required Input and expected Output
    - Try brute force
2. Root cause (if any)
3. check if there is any workaround/alternatives or someone have solved it (if any)


<p> Once the problem is understood:</p>

1. Draw it in a piece of paper. Think of a flow chart
2. express it in words on how will the script work. (like a cookbook recipe)


---

<p> With that here are the basics of Python. </p>

  <dt> Data Types </dt>
  <dd> String  - texts wrapped in quotation mark. e.g "One",'one',"Hello World" </dd>
  <dd> Integer - whole numbers. eg. 1,2,3,4,100,1000 </dd>
  <dd> Float   - decimal numbers. eg. 1.2, 3.5 </dd>
  
  <p> NOTE: String and Integer can't be mixed together. It is a *TypeError* </p>
  
  <p> To check the datatype, use the function **type** </p>
  
```python
>>> type("hello")
<class 'str'>
>>> type(123)
<class 'int'>
>>> type(3.2)
<class 'float'>
```

  <dt> Variables </dt>
  <dd> Variables - name of containers for storing values. It can be any data type: String, Integer, Float..etc. 
  Generally, variables can be named anything but the general rule is to not use the built-in python functions like print. 
  It can't start with an Integer(SyntaxError). It cant also start with a space(IndentationError). Also 
  variables are case sensitive</dd>
  <dd> Assignment - stored value inside a variable </dd>
  
 <p>To show the variable assignment in python, use **print** function</p>
  
  
```python
>>> hello ="hello_world" #hello=variable;hello_world=assignment
>>>  hello="hi"
  File "<stdin>", line 1
    hello="hi"
    ^
IndentationError: unexpected indent
>>> 2hello="hi"
  File "<stdin>", line 1
    2hello="hi"
     ^
SyntaxError: invalid syntax
>>> print(hello)
hello_world
```
  
  
  <dd> Integer Arithmetic operators </dd>
  <dd> a + b = Adds a and b </dd>
  <dd> a - b = Subtracts b from a </dd>
  <dd> a * b = Multiplies a and b </dd>
  <dd> a / b = Divides a by b (e.g 5/2 = 2.5) </dd>
  <dd> a ** b = Elevates a to the power of b. For non integer values of b, this becomes a root (i.e. a**(1/2) is the square root of a) </dd>
  <dd> a // b = The integer part of the integer division of a by b (e.g 5//2 = 2) </dd>
  <dd> a % b = The remainder part of the integer division of a by b (e.g 5%2 = 1) </dd>
  
  ```python
>>> a=5
>>> b=2
>>> a+b
7
>>> a-b
3
>>> a*b
10
>>> a/b
2.5
>>> a**b
25
>>> a//b
2
>>> a%b
1
```

  <dt> Conditionals </dt>
  <dd> <b>Compare</b> </dd>
  <dd> a == b: a is equal to b </dd>
  <dd> a != b: a is different than b </dd>
  <dd> a < b: a is smaller than b </dd>
  <dd> a <= b: a is smaller or equal to b </dd>
  <dd> a > b: a is bigger than b </dd>
  <dd> a >= b: a is bigger or equal to b </dd>
  <dd> <b>Logic operators</b> </dd>
  <dd> a and b: True if both a and b are True. False otherwise. </dd>
  <dd>  a or b: True if either a or b or both are True. False if both are False. </dd>
  <dd> not a: True if a is False, False if a is True. </dd>
  
  ```python
>>> a=5
>>> b=2
>>> a==b
False
>>> a!=b
True
>>> a<5
False
>>> a>b
True
>>> a<=b
False
>>> a>=b
True
>>> True and True
True
>>> False and True
False
>>> True or True
True
>>> False or False
False
>>> True or False
True
>>> not True
False
>>> not False
True
```

  <dt> Branching conditionals </dt>
  <dd> <b> if-elif-else block </b> </dd>
  
  ---
  **REMEMBER**
  
  Indentation matters in Python
  
  ---
  
  ```python
if condition1:
	if-block
elif condition2:
	elif-block
else:
	else-block
  
 # EXAMPLE1
  
 age = 10
 if age < 18:
    print('not considered adult')
 elif age < 35:
    print('work hard and invest wisely')
 elif age >= 36:
    print('reap benefits')
  
not considered adult
  
 # EXAMPLE2
  
age,color=15,'yellow'
if age <=30 and ( color == 'white' or color == 'yellow'):
    print('still good')
else:
    print('spoiled')
 
spoiled
```
  
  </dl>

  
    
    
