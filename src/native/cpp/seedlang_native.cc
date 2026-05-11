/**
 * SeedLang C++ Native Module
 * 极限边界测试的高性能实现
 */

#include <node.h>
#include <nan.h>
#include <vector>
#include <string>
#include <cmath>
#include <limits>
#include <functional>
#include <memory>
#include <chrono>
#include <random>
#include <algorithm>
#include <numeric>
#include <map>
#include <set>

using namespace v8;
using namespace node;

namespace SeedLang {

class ExtremeTest {
public:
    static void Init(Local<Object> exports);
    
private:
    static void Fibonacci(const Nan::FunctionCallbackInfo<Value>& info);
    static void Factorial(const Nan::FunctionCallbackInfo<Value>& info);
    static void DeepRecursion(const Nan::FunctionCallbackInfo<Value>& info);
    static void MutualRecursion(const Nan::FunctionCallbackInfo<Value>& info);
    static void TailRecursion(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void DeepClosure(const Nan::FunctionCallbackInfo<Value>& info);
    static void ClosureCapture(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void LargeArraySort(const Nan::FunctionCallbackInfo<Value>& info);
    static void LargeArrayMap(const Nan::FunctionCallbackInfo<Value>& info);
    static void LargeArrayFilter(const Nan::FunctionCallbackInfo<Value>& info);
    static void LargeArrayReduce(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void LongStringBuild(const Nan::FunctionCallbackInfo<Value>& info);
    static void UnicodeProcess(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void DeepNestedObject(const Nan::FunctionCallbackInfo<Value>& info);
    static void ObjectMerge(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void BitwiseOperations(const Nan::FunctionCallbackInfo<Value>& info);
    static void MathExtreme(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void MemoryStress(const Nan::FunctionCallbackInfo<Value>& info);
    static void PerformanceBenchmark(const Nan::FunctionCallbackInfo<Value>& info);
    
    static void ComplexExpression(const Nan::FunctionCallbackInfo<Value>& info);
    static void ComplexControlFlow(const Nan::FunctionCallbackInfo<Value>& info);
    
    static uint64_t fibonacciImpl(uint64_t n);
    static uint64_t factorialImpl(uint64_t n);
    static bool isEvenImpl(uint64_t n);
    static bool isOddImpl(uint64_t n);
    static uint64_t tailSumImpl(uint64_t n, uint64_t acc);
};

uint64_t ExtremeTest::fibonacciImpl(uint64_t n) {
    if (n <= 1) return n;
    return fibonacciImpl(n - 1) + fibonacciImpl(n - 2);
}

uint64_t ExtremeTest::factorialImpl(uint64_t n) {
    if (n <= 1) return 1;
    return n * factorialImpl(n - 1);
}

bool ExtremeTest::isEvenImpl(uint64_t n) {
    if (n == 0) return true;
    return isOddImpl(n - 1);
}

bool ExtremeTest::isOddImpl(uint64_t n) {
    if (n == 0) return false;
    return isEvenImpl(n - 1);
}

uint64_t ExtremeTest::tailSumImpl(uint64_t n, uint64_t acc) {
    if (n == 0) return acc;
    return tailSumImpl(n - 1, acc + n);
}

void ExtremeTest::Fibonacci(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    uint64_t n = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    uint64_t result = fibonacciImpl(n);
    
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::Factorial(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    uint64_t n = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    uint64_t result = factorialImpl(n);
    
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::DeepRecursion(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    uint64_t depth = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    uint64_t result = fibonacciImpl(depth);
    
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::MutualRecursion(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    uint64_t n = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    bool result = isEvenImpl(n);
    
    info.GetReturnValue().Set(Nan::New<Boolean>(result));
}

void ExtremeTest::TailRecursion(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    uint64_t n = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    uint64_t result = tailSumImpl(n, 0);
    
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::DeepClosure(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int depth = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    std::function<int(int)> nested = [](int x) { return x; };
    
    for (int i = 0; i < depth; i++) {
        auto prev = nested;
        nested = [prev, i](int x) {
            return prev(x) + i;
        };
    }
    
    int result = nested(0);
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::ClosureCapture(const Nan::FunctionCallbackInfo<Value>& info) {
    auto counter = std::make_shared<int>(0);
    
    auto increment = [counter]() {
        (*counter)++;
        return *counter;
    };
    
    increment();
    increment();
    int result = increment();
    
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::LargeArraySort(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int size = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    std::vector<int> arr(size);
    for (int i = 0; i < size; i++) {
        arr[i] = size - i;
    }
    
    auto start = std::chrono::high_resolution_clock::now();
    std::sort(arr.begin(), arr.end());
    auto end = std::chrono::high_resolution_clock::now();
    
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    Local<Object> result = Nan::New<Object>();
    Nan::Set(result, Nan::New("first").ToLocalChecked(), Nan::New<Number>(arr[0]));
    Nan::Set(result, Nan::New("last").ToLocalChecked(), Nan::New<Number>(arr[size - 1]));
    Nan::Set(result, Nan::New("duration_us").ToLocalChecked(), Nan::New<Number>(duration.count()));
    
    info.GetReturnValue().Set(result);
}

void ExtremeTest::LargeArrayMap(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int size = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    std::vector<int> arr(size);
    for (int i = 0; i < size; i++) {
        arr[i] = i;
    }
    
    std::vector<int> mapped(size);
    std::transform(arr.begin(), arr.end(), mapped.begin(), [](int x) { return x * 2; });
    
    Local<Array> result = Nan::New<Array>(size);
    for (int i = 0; i < std::min(size, 10); i++) {
        Nan::Set(result, i, Nan::New<Number>(mapped[i]));
    }
    
    info.GetReturnValue().Set(result);
}

void ExtremeTest::LargeArrayFilter(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int size = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    std::vector<int> arr(size);
    for (int i = 0; i < size; i++) {
        arr[i] = i;
    }
    
    std::vector<int> filtered;
    std::copy_if(arr.begin(), arr.end(), std::back_inserter(filtered), 
                 [](int x) { return x % 2 == 0; });
    
    info.GetReturnValue().Set(Nan::New<Number>(static_cast<int>(filtered.size())));
}

void ExtremeTest::LargeArrayReduce(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int size = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    std::vector<int> arr(size);
    for (int i = 0; i < size; i++) {
        arr[i] = i + 1;
    }
    
    int sum = std::accumulate(arr.begin(), arr.end(), 0);
    
    info.GetReturnValue().Set(Nan::New<Number>(sum));
}

void ExtremeTest::LongStringBuild(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int length = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    std::string result(length, 'a');
    
    info.GetReturnValue().Set(Nan::New<Number>(static_cast<int>(result.length())));
}

void ExtremeTest::UnicodeProcess(const Nan::FunctionCallbackInfo<Value>& info) {
    std::string unicode = "你好世界🌍🎉";
    
    info.GetReturnValue().Set(Nan::New(unicode).ToLocalChecked());
}

void ExtremeTest::DeepNestedObject(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int depth = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    Local<Object> current = Nan::New<Object>();
    Nan::Set(current, Nan::New("value").ToLocalChecked(), Nan::New<Number>(42));
    
    for (int i = 0; i < depth; i++) {
        Local<Object> nested = Nan::New<Object>();
        Nan::Set(nested, Nan::New("nested").ToLocalChecked(), current);
        current = nested;
    }
    
    info.GetReturnValue().Set(current);
}

void ExtremeTest::ObjectMerge(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 2 || !info[0]->IsObject() || !info[1]->IsObject()) {
        Nan::ThrowTypeError("Expected two object arguments");
        return;
    }
    
    Local<Object> obj1 = info[0]->ToObject(Nan::GetCurrentContext()).ToLocalChecked();
    Local<Object> obj2 = info[1]->ToObject(Nan::GetCurrentContext()).ToLocalChecked();
    
    Local<Object> result = Nan::New<Object>();
    
    Local<Array> keys1 = obj1->GetOwnPropertyNames(Nan::GetCurrentContext()).ToLocalChecked();
    for (uint32_t i = 0; i < keys1->Length(); i++) {
        Local<Value> key = keys1->Get(Nan::GetCurrentContext(), i).ToLocalChecked();
        Nan::Set(result, key, obj1->Get(Nan::GetCurrentContext(), key).ToLocalChecked());
    }
    
    Local<Array> keys2 = obj2->GetOwnPropertyNames(Nan::GetCurrentContext()).ToLocalChecked();
    for (uint32_t i = 0; i < keys2->Length(); i++) {
        Local<Value> key = keys2->Get(Nan::GetCurrentContext(), i).ToLocalChecked();
        Nan::Set(result, key, obj2->Get(Nan::GetCurrentContext(), key).ToLocalChecked());
    }
    
    info.GetReturnValue().Set(result);
}

void ExtremeTest::BitwiseOperations(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 2 || !info[0]->IsNumber() || !info[1]->IsNumber()) {
        Nan::ThrowTypeError("Expected two number arguments");
        return;
    }
    
    int a = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    int b = info[1]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    
    Local<Object> result = Nan::New<Object>();
    Nan::Set(result, Nan::New("and").ToLocalChecked(), Nan::New<Number>(a & b));
    Nan::Set(result, Nan::New("or").ToLocalChecked(), Nan::New<Number>(a | b));
    Nan::Set(result, Nan::New("xor").ToLocalChecked(), Nan::New<Number>(a ^ b));
    Nan::Set(result, Nan::New("not").ToLocalChecked(), Nan::New<Number>(~a));
    Nan::Set(result, Nan::New("leftShift").ToLocalChecked(), Nan::New<Number>(a << 4));
    Nan::Set(result, Nan::New("rightShift").ToLocalChecked(), Nan::New<Number>(a >> 2));
    
    info.GetReturnValue().Set(result);
}

void ExtremeTest::MathExtreme(const Nan::FunctionCallbackInfo<Value>& info) {
    Local<Object> result = Nan::New<Object>();
    
    Nan::Set(result, Nan::New("sin").ToLocalChecked(), Nan::New<Number>(std::sin(0)));
    Nan::Set(result, Nan::New("cos").ToLocalChecked(), Nan::New<Number>(std::cos(0)));
    Nan::Set(result, Nan::New("tan").ToLocalChecked(), Nan::New<Number>(std::tan(0)));
    Nan::Set(result, Nan::New("log").ToLocalChecked(), Nan::New<Number>(std::log(std::exp(1))));
    Nan::Set(result, Nan::New("exp").ToLocalChecked(), Nan::New<Number>(std::exp(1)));
    Nan::Set(result, Nan::New("pow").ToLocalChecked(), Nan::New<Number>(std::pow(2, 10)));
    Nan::Set(result, Nan::New("sqrt").ToLocalChecked(), Nan::New<Number>(std::sqrt(16)));
    Nan::Set(result, Nan::New("floor").ToLocalChecked(), Nan::New<Number>(std::floor(3.7)));
    Nan::Set(result, Nan::New("ceil").ToLocalChecked(), Nan::New<Number>(std::ceil(3.2)));
    Nan::Set(result, Nan::New("round").ToLocalChecked(), Nan::New<Number>(std::round(3.5)));
    Nan::Set(result, Nan::New("abs").ToLocalChecked(), Nan::New<Number>(std::abs(-42)));
    
    Nan::Set(result, Nan::New("maxInt").ToLocalChecked(), 
             Nan::New<Number>(std::numeric_limits<int64_t>::max()));
    Nan::Set(result, Nan::New("minInt").ToLocalChecked(), 
             Nan::New<Number>(std::numeric_limits<int64_t>::min()));
    Nan::Set(result, Nan::New("epsilon").ToLocalChecked(), 
             Nan::New<Number>(std::numeric_limits<double>::epsilon()));
    
    info.GetReturnValue().Set(result);
}

void ExtremeTest::MemoryStress(const Nan::FunctionCallbackInfo<Value>& info) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Expected a number argument");
        return;
    }
    
    int megabytes = info[0]->IntegerValue(Nan::GetCurrentContext()).FromJust();
    size_t bytes = static_cast<size_t>(megabytes) * 1024 * 1024;
    
    try {
        std::vector<char> buffer(bytes);
        std::fill(buffer.begin(), buffer.end(), 'x');
        
        Local<Object> result = Nan::New<Object>();
        Nan::Set(result, Nan::New("allocated").ToLocalChecked(), Nan::New<Number>(megabytes));
        Nan::Set(result, Nan::New("success").ToLocalChecked(), Nan::New<Boolean>(true));
        
        info.GetReturnValue().Set(result);
    } catch (const std::bad_alloc&) {
        Local<Object> result = Nan::New<Object>();
        Nan::Set(result, Nan::New("allocated").ToLocalChecked(), Nan::New<Number>(0));
        Nan::Set(result, Nan::New("success").ToLocalChecked(), Nan::New<Boolean>(false));
        
        info.GetReturnValue().Set(result);
    }
}

void ExtremeTest::PerformanceBenchmark(const Nan::FunctionCallbackInfo<Value>& info) {
    auto start = std::chrono::high_resolution_clock::now();
    
    volatile int sum = 0;
    for (int i = 0; i < 1000000; i++) {
        sum += i;
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    Local<Object> result = Nan::New<Object>();
    Nan::Set(result, Nan::New("iterations").ToLocalChecked(), Nan::New<Number>(1000000));
    Nan::Set(result, Nan::New("duration_us").ToLocalChecked(), Nan::New<Number>(duration.count()));
    Nan::Set(result, Nan::New("ops_per_second").ToLocalChecked(), 
             Nan::New<Number>(1000000.0 / (duration.count() / 1000000.0)));
    
    info.GetReturnValue().Set(result);
}

void ExtremeTest::ComplexExpression(const Nan::FunctionCallbackInfo<Value>& info) {
    double a = 10, b = 3, c = 5, d = 2;
    
    double result = std::floor(a / b) + a - std::floor(a / b) * b + c * d - (a + b) / c;
    
    info.GetReturnValue().Set(Nan::New<Number>(result));
}

void ExtremeTest::ComplexControlFlow(const Nan::FunctionCallbackInfo<Value>& info) {
    std::vector<std::string> result;
    
    for (int i = 0; i < 10; i++) {
        bool isEven = (i % 2 == 0);
        if (isEven) {
            switch (i) {
                case 0:
                    result.push_back("zero");
                    break;
                case 4:
                    result.push_back("four");
                    break;
                default:
                    result.push_back(std::to_string(i));
            }
        }
    }
    
    std::string joined;
    for (size_t i = 0; i < result.size(); i++) {
        if (i > 0) joined += "-";
        joined += result[i];
    }
    
    info.GetReturnValue().Set(Nan::New(joined).ToLocalChecked());
}

void ExtremeTest::Init(Local<Object> exports) {
    Nan::SetMethod(exports, "fibonacci", Fibonacci);
    Nan::SetMethod(exports, "factorial", Factorial);
    Nan::SetMethod(exports, "deepRecursion", DeepRecursion);
    Nan::SetMethod(exports, "mutualRecursion", MutualRecursion);
    Nan::SetMethod(exports, "tailRecursion", TailRecursion);
    
    Nan::SetMethod(exports, "deepClosure", DeepClosure);
    Nan::SetMethod(exports, "closureCapture", ClosureCapture);
    
    Nan::SetMethod(exports, "largeArraySort", LargeArraySort);
    Nan::SetMethod(exports, "largeArrayMap", LargeArrayMap);
    Nan::SetMethod(exports, "largeArrayFilter", LargeArrayFilter);
    Nan::SetMethod(exports, "largeArrayReduce", LargeArrayReduce);
    
    Nan::SetMethod(exports, "longStringBuild", LongStringBuild);
    Nan::SetMethod(exports, "unicodeProcess", UnicodeProcess);
    
    Nan::SetMethod(exports, "deepNestedObject", DeepNestedObject);
    Nan::SetMethod(exports, "objectMerge", ObjectMerge);
    
    Nan::SetMethod(exports, "bitwiseOperations", BitwiseOperations);
    Nan::SetMethod(exports, "mathExtreme", MathExtreme);
    
    Nan::SetMethod(exports, "memoryStress", MemoryStress);
    Nan::SetMethod(exports, "performanceBenchmark", PerformanceBenchmark);
    
    Nan::SetMethod(exports, "complexExpression", ComplexExpression);
    Nan::SetMethod(exports, "complexControlFlow", ComplexControlFlow);
}

}

NODE_MODULE(seedlang_native, SeedLang::ExtremeTest::Init)
